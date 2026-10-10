import { houseInstant, parseHouseDateTime } from '../../core/time/house-date-time';
import { HOT_WATER_READING_OUT_OF_DATE_MS, WaterTemperatures } from './water-api';

/**
 * The last reading of the hot water as a view shows it - read once here, so that the hot-water
 * page and the tile of the overview cannot come to tell the same answer differently.
 */
export interface WaterReading {
  /** The water in the tank, in °C; `undefined` when the answer has no such number. */
  readonly tank?: number;
  readonly circulation?: number;
  /** House wall-clock time the sensors were read; `undefined` when the answer does not say. */
  readonly measuredAt?: string;
  /** The instant of that reading, for its age. */
  readonly measuredInstant?: number;
}

const temperature = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/**
 * Reads the answer of `GET /home/water/status/temperature`. Nothing checks an answer at
 * runtime, and before its first reading the service answers with no body at all: whatever is
 * not a finite number is "nothing measured", and a time that is no date-time of the house is
 * "not known" - never the time of the call.
 */
export function toWaterReading(
  answer: WaterTemperatures | null | undefined,
  timeZone: string,
): WaterReading {
  const at: unknown = answer?.measuredAt;
  const parsed = typeof at === 'string' ? parseHouseDateTime(at) : undefined;
  return {
    tank: temperature(answer?.water?.temperature),
    circulation: temperature(answer?.circulation?.temperature),
    measuredAt: parsed ? (at as string) : undefined,
    measuredInstant: parsed ? houseInstant(parsed, timeZone) : undefined,
  };
}

/**
 * The service has missed two of its polls: what a view shows is the last row it stored, not
 * the water as it is. Never true for a reading without its time.
 *
 * The age is counted by the clock of the browser against a time of the service, like every age
 * in this application: a browser whose clock is minutes off sees the warning early, or late.
 */
export function isOutOfDate(reading: WaterReading, now: number): boolean {
  return (
    reading.measuredInstant !== undefined &&
    now - reading.measuredInstant > HOT_WATER_READING_OUT_OF_DATE_MS
  );
}
