import { houseInstant, parseHouseDateTime } from '../../core/time/house-date-time';
import { CurrentMetric, CurrentWeather, WeatherMetric } from './weather-api';

/** One metric as a view shows it: its value and how old it is. */
export interface MetricReading<T> {
  readonly value: T;
  /** House wall-clock time the station last had this value; `undefined` when not said. */
  readonly measuredAt?: string;
  /** The instant of that time, for its age. */
  readonly measuredInstant?: number;
  /** The service says the value is older than the silence it alerts on. Absent is not stale. */
  readonly stale: boolean;
}

/**
 * The current weather as the strip of the shell and the tile of the overview show it - read once
 * here, so that the two cannot come to tell the same answer differently. **A metric the answer
 * leaves out, or whose value is not of its kind, is `undefined`** - nothing is drawn for it,
 * never a 0 and never "no rain".
 */
export interface WeatherReading {
  readonly temperature?: MetricReading<number>;
  readonly humidity?: MetricReading<number>;
  readonly dewPoint?: MetricReading<number>;
  readonly wind?: MetricReading<number>;
  readonly gust?: MetricReading<number>;
  readonly illuminance?: MetricReading<number>;
  readonly raining?: MetricReading<boolean>;
  /** hPa at the station, not reduced to sea level. */
  readonly pressure?: MetricReading<number>;
  readonly uv?: MetricReading<number>;
  /** Where the wind comes from, in degrees clockwise from north. */
  readonly windDirection?: MetricReading<number>;
  /** The running total of the station's rain gauge; its unit is not confirmed yet. */
  readonly precipitation?: MetricReading<number>;
  /** % */
  readonly battery?: MetricReading<number>;
  /** V */
  readonly voltage?: MetricReading<number>;
}

/**
 * From this sustained wind on the strip leads with the wind instead of the thermometer: 8 m/s is
 * the lower end of a fresh breeze (Beaufort 5), the wind that moves small trees - and blinds.
 */
export const WINDY_FROM_MS = 8;

/** The icon the strip leads with: rain first, then a strong wind, else the thermometer. */
export type WeatherIcon = 'rainy' | 'air' | 'device_thermostat';

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

function metric<T>(
  answer: unknown,
  ofKind: (value: unknown) => value is T,
  timeZone: string,
): MetricReading<T> | undefined {
  if (typeof answer !== 'object' || answer === null) {
    return undefined;
  }
  const { value, measuredAt, stale } = answer as CurrentMetric;
  if (!ofKind(value)) {
    return undefined;
  }
  const parsed = typeof measuredAt === 'string' ? parseHouseDateTime(measuredAt) : undefined;
  return {
    value,
    measuredAt: parsed ? measuredAt : undefined,
    measuredInstant: parsed ? houseInstant(parsed, timeZone) : undefined,
    stale: stale === true,
  };
}

/**
 * Reads the answer of `GET /home/weather/current`. Nothing checks an answer at runtime: an
 * answer that is no object is a station heard of nothing, a value that is not a finite number
 * (a flag for `raining`) is left out, and a time that is no date-time of the house is not known.
 */
export function toWeatherReading(
  answer: CurrentWeather | null | undefined,
  timeZone: string,
): WeatherReading {
  const of = (name: WeatherMetric): unknown =>
    typeof answer === 'object' && answer !== null ? answer[name] : undefined;
  return {
    temperature: metric(of('temperature'), isNumber, timeZone),
    humidity: metric(of('humidity'), isNumber, timeZone),
    dewPoint: metric(of('dewPoint'), isNumber, timeZone),
    wind: metric(of('wind'), isNumber, timeZone),
    gust: metric(of('gust'), isNumber, timeZone),
    illuminance: metric(of('illuminance'), isNumber, timeZone),
    raining: metric(of('raining'), isBoolean, timeZone),
    pressure: metric(of('pressure'), isNumber, timeZone),
    uv: metric(of('uv'), isNumber, timeZone),
    windDirection: metric(of('windDirection'), isNumber, timeZone),
    precipitation: metric(of('precipitation'), isNumber, timeZone),
    battery: metric(of('battery'), isNumber, timeZone),
    voltage: metric(of('voltage'), isNumber, timeZone),
  };
}

/**
 * The point of the compass a direction is nearest to, of eight: `n`, `ne`, ... `nw`.
 * `undefined` for a value that is no angle.
 */
export type CompassPoint = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

const COMPASS: readonly CompassPoint[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

export function compassPoint(degrees: number): CompassPoint | undefined {
  if (!Number.isFinite(degrees)) {
    return undefined;
  }
  const turned = ((degrees % 360) + 360) % 360;
  return COMPASS[Math.round(turned / 45) % 8];
}

/** The icon the strip leads with. Rain that is not known is not "no rain", but it is no rain icon. */
export function leadingIcon(reading: WeatherReading): WeatherIcon {
  if (reading.raining?.value === true) {
    return 'rainy';
  }
  if (reading.wind !== undefined && reading.wind.value >= WINDY_FROM_MS) {
    return 'air';
  }
  return 'device_thermostat';
}

/**
 * The newest time among the metrics given - the last the station was heard of them - and
 * whether every one of them is stale. `undefined` when none of them says when it was measured.
 */
export function newestOf(
  metrics: readonly (MetricReading<unknown> | undefined)[],
): { readonly measuredAt: string; readonly allStale: boolean } | undefined {
  const shown = metrics.filter((each): each is MetricReading<unknown> => each !== undefined);
  let newest: MetricReading<unknown> | undefined;
  for (const each of shown) {
    if (
      each.measuredInstant !== undefined &&
      (newest?.measuredInstant === undefined || each.measuredInstant > newest.measuredInstant)
    ) {
      newest = each;
    }
  }
  return newest?.measuredAt === undefined
    ? undefined
    : { measuredAt: newest.measuredAt, allStale: shown.every((each) => each.stale) };
}
