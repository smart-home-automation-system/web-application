import { MessageKey } from '../../i18n/messages';

/**
 * The air quality outside, on the scale of the Polish air quality index of GIOS (HAS-431): six levels, 1 very good
 * ... 6 very bad. One place for the weather page, the strip of the panel and the tile of the overview, so that the
 * three never word one reading differently.
 *
 * The level of the whole is the sensor's (`airQualityLevel` of `weather-service`, the BleBox airSensor judges the
 * newest of its three measurements); the level of PM10 and PM2.5 alone is computed here from the thresholds of the
 * index - the same numbers notification-service words the smog by (HAS-430: "very bad" above PM10 150 or PM2.5
 * 110). A threshold belongs to the level below it: 20 µg/m³ of PM10 is still very good.
 */
export type AirLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** The upper ends of the levels 1 - 5 for PM10, µg/m³ (the hourly index of GIOS). */
export const PM10_THRESHOLDS = [20, 50, 80, 110, 150] as const;
/** The same for PM2.5, µg/m³. */
export const PM25_THRESHOLDS = [13, 35, 55, 75, 110] as const;

/** PM10 from which the air is moderate and from which it is bad - drawn across the chart of the page. */
export const PM10_MODERATE_FROM = PM10_THRESHOLDS[1];
export const PM10_BAD_FROM = PM10_THRESHOLDS[3];

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function levelBy(thresholds: readonly number[], value: unknown): AirLevel | undefined {
  if (!finite(value) || value < 0) {
    return undefined;
  }
  return (1 + thresholds.filter((threshold) => value > threshold).length) as AirLevel;
}

/** The level of a PM10 value; `undefined` for anything that is no concentration. */
export const levelOfPm10 = (value: unknown): AirLevel | undefined =>
  levelBy(PM10_THRESHOLDS, value);

/** The level of a PM2.5 value; `undefined` for anything that is no concentration. */
export const levelOfPm25 = (value: unknown): AirLevel | undefined =>
  levelBy(PM25_THRESHOLDS, value);

/**
 * A level as the service sends it: a whole number from 1 to 6. Anything else is not known - never read as the
 * nearest level.
 */
export function airLevelOf(value: unknown): AirLevel | undefined {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 6
    ? (value as AirLevel)
    : undefined;
}

/** The word of a level, the same on the card, the strip and the tile. */
export const AIR_LEVEL_LABELS: Readonly<Record<AirLevel, MessageKey>> = {
  1: 'weather.air.level.veryGood',
  2: 'weather.air.level.good',
  3: 'weather.air.level.moderate',
  4: 'weather.air.level.sufficient',
  5: 'weather.air.level.bad',
  6: 'weather.air.level.veryBad',
};

/**
 * The colour of a level, `--app-air-<level>` of `_seasons.scss` - for a dot, an edge, a mark; never for text,
 * and never alone: the word of the level is always written beside it.
 */
export const airLevelColour = (level: AirLevel): string => `var(--app-air-${level})`;
