import { EnergyForecast, ForecastCompared } from '../../data-access/energy/energy-api';
import { MessageKey } from '../../i18n/messages';
import { numberOf } from './energy-views';

/**
 * The forecast of the energy page read for the screen (HAS-373), pure. **The categories are the
 * service's** (`GET /energy/forecast` judges a day against the house load by its own bands) - this
 * file never compares a coverage with a number. What the answer leaves out is "not known": a day
 * without its kWh has no bar, a category this version does not know is printed as it came.
 */

/** The categories of energy-service in its words, `none` to `good`. */
export const FORECAST_CATEGORIES = ['none', 'poor', 'fair', 'good'] as const;
export type ForecastCategory = (typeof FORECAST_CATEGORIES)[number];

const CATEGORY_LABELS: Readonly<Record<ForecastCategory, MessageKey>> = {
  none: 'energy.forecast.category.none',
  poor: 'energy.forecast.category.poor',
  fair: 'energy.forecast.category.fair',
  good: 'energy.forecast.category.good',
};

/** The same words inside a sentence ("Tomorrow: poor, ..."). */
const CATEGORY_INLINE: Readonly<Record<ForecastCategory, MessageKey>> = {
  none: 'energy.forecast.inline.none',
  poor: 'energy.forecast.inline.poor',
  fair: 'energy.forecast.inline.fair',
  good: 'energy.forecast.inline.good',
};

/** "on Monday" ... "on Sunday", by `getUTCDay()` - the weekday of a date of the house. */
const ON_WEEKDAY: readonly MessageKey[] = [
  'energy.forecast.on.sunday',
  'energy.forecast.on.monday',
  'energy.forecast.on.tuesday',
  'energy.forecast.on.wednesday',
  'energy.forecast.on.thursday',
  'energy.forecast.on.friday',
  'energy.forecast.on.saturday',
];

/** The days from the fourth on are paler: the further, the less the forecast is worth. */
export const PALE_FROM_DAY = 3;

function categoryOf(value: unknown): ForecastCategory | undefined {
  return typeof value === 'string' && (FORECAST_CATEGORIES as readonly string[]).includes(value)
    ? (value as ForecastCategory)
    : undefined;
}

/** The key of the word of a category, `undefined` for one this version does not know. */
export function categoryLabel(value: unknown): MessageKey | undefined {
  const category = categoryOf(value);
  return category === undefined ? undefined : CATEGORY_LABELS[category];
}

/** A day of the forecast as its column shows it. */
export interface ForecastDayView {
  readonly day: string;
  readonly solax?: number;
  readonly sofar?: number;
  readonly total?: number;
  /** The share of the house load, % rounded; `undefined` while not known. */
  readonly share?: number;
  /** A category of the service this version knows. */
  readonly category?: ForecastCategory;
  /** What the service sent as the category when this version does not know it. */
  readonly otherCategory?: string;
  readonly cloudCover?: number;
  readonly sunshineHours?: number;
  readonly pale: boolean;
}

/** A closed day: what the forecast gave and what the inverters produced, both inverters summed. */
export interface ForecastPastView {
  readonly day: string;
  readonly forecast?: number;
  readonly actual?: number;
  readonly actualSolax?: number;
  readonly actualSofar?: number;
}

/** The sum of two amounts, `undefined` unless both are known. */
function sum(a: number | undefined, b: number | undefined): number | undefined {
  return a === undefined || b === undefined ? undefined : a + b;
}

function compared(value: ForecastCompared | undefined) {
  return { forecast: numberOf(value?.forecastKwh), actual: numberOf(value?.actualKwh) };
}

export function forecastDays(answer: EnergyForecast | null | undefined): ForecastDayView[] {
  const days: unknown = answer?.days;
  if (!Array.isArray(days)) {
    return [];
  }
  return (days as EnergyForecast['days'] & object)
    .filter((day) => typeof day?.day === 'string')
    .map((day, index): ForecastDayView => {
      const coverage = numberOf(day.coverage);
      const category = categoryOf(day.category);
      return {
        day: day.day as string,
        solax: numberOf(day.solaxKwh),
        sofar: numberOf(day.sofarKwh),
        total: numberOf(day.totalKwh),
        share: coverage === undefined ? undefined : Math.round(coverage * 100),
        category,
        otherCategory:
          category === undefined && typeof day.category === 'string' ? day.category : undefined,
        cloudCover: numberOf(day.cloudCover),
        sunshineHours: numberOf(day.sunshineHours),
        pale: index >= PALE_FROM_DAY,
      };
    });
}

export function forecastPast(answer: EnergyForecast | null | undefined): ForecastPastView[] {
  const past: unknown = answer?.past;
  if (!Array.isArray(past)) {
    return [];
  }
  return (past as EnergyForecast['past'] & object)
    .filter((day) => typeof day?.day === 'string')
    .map((day) => {
      const solax = compared(day.solax);
      const sofar = compared(day.sofar);
      return {
        day: day.day as string,
        forecast: sum(solax.forecast, sofar.forecast),
        actual: sum(solax.actual, sofar.actual),
        actualSolax: solax.actual,
        actualSofar: sofar.actual,
      };
    });
}

/**
 * The height every bar is measured against: the largest amount on the card - a day, a closed day
 * either way, the house load - so the line of the house load stands where its number is. `undefined`
 * while nothing is known or everything is 0.
 */
export function scaleOf(
  days: readonly ForecastDayView[],
  past: readonly ForecastPastView[],
  houseLoad: number | undefined,
): number | undefined {
  const amounts = [
    ...days.map((day) => day.total ?? sum(day.solax ?? 0, day.sofar ?? 0)),
    ...past.flatMap((day) => [day.forecast, day.actual]),
    houseLoad,
  ].filter((amount): amount is number => amount !== undefined && amount > 0);
  return amounts.length === 0 ? undefined : Math.max(...amounts);
}

/** The height of an amount as a share of the bar area, 0 - 100 %. */
export function heightOf(amount: number | undefined, scale: number | undefined): number {
  return amount === undefined || scale === undefined || amount <= 0
    ? 0
    : Math.min(100, (amount / scale) * 100);
}

/** What the sentence over the columns says - put into words by the template. */
export type OutlookView =
  /** No category on any day: the service had no house load to judge by. */
  | { readonly kind: 'unknown' }
  /** None of the seven days is fair or good. */
  | { readonly kind: 'noSun'; readonly days: number }
  /** Today is fair or good; `tomorrow` says whether tomorrow is too. */
  | { readonly kind: 'today'; readonly tomorrow: boolean }
  /** The sun comes back after `days` days - tomorrow, or on `weekday`. */
  | {
      readonly kind: 'back';
      readonly days: number;
      readonly on: MessageKey | 'tomorrow';
      readonly kwh?: number;
      readonly share?: number;
    };

const sunny = (category: ForecastCategory | undefined) =>
  category === 'fair' || category === 'good';

/** The sentence of the coming days, from `outlook` of the service and the categories of its days. */
export function outlookOf(answer: EnergyForecast | null | undefined): OutlookView {
  const days = forecastDays(answer);
  const backOn = answer?.outlook?.sunBackOn;
  const without = numberOf(answer?.outlook?.daysWithoutSun);
  if (days.every((day) => day.category === undefined) || without === undefined) {
    return { kind: 'unknown' };
  }
  if (typeof backOn !== 'string') {
    return { kind: 'noSun', days: without };
  }
  if (without === 0) {
    return { kind: 'today', tomorrow: sunny(days[1]?.category) };
  }
  const back = days.find((day) => day.day === backOn);
  const weekday = ON_WEEKDAY[new Date(`${backOn}T00:00:00Z`).getUTCDay()];
  if (without > 1 && weekday === undefined) {
    // a day the service named that is no date: said as no day
    return { kind: 'unknown' };
  }
  return {
    kind: 'back',
    days: without,
    on: without === 1 ? 'tomorrow' : weekday,
    kwh: back?.total === undefined ? undefined : Math.round(back.total),
    share: back?.share,
  };
}

/** The line of the overview tile: tomorrow's word and kWh, as much of it as is known. */
export type TomorrowView =
  | { readonly kind: 'both'; readonly word: MessageKey; readonly kwh: number }
  | { readonly kind: 'kwh'; readonly kwh: number }
  | { readonly kind: 'unknown' };

export function tomorrowOf(answer: EnergyForecast | null | undefined): TomorrowView {
  const tomorrow = forecastDays(answer)[1];
  if (tomorrow?.total === undefined) {
    return { kind: 'unknown' };
  }
  const kwh = Math.round(tomorrow.total);
  return tomorrow.category === undefined
    ? { kind: 'kwh', kwh }
    : { kind: 'both', word: CATEGORY_INLINE[tomorrow.category], kwh };
}
