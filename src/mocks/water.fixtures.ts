import {
  WaterConsumption,
  WaterHeatingDemand,
  WaterTemperatures,
  WaterValve,
} from '../app/data-access/water/water-api';
import { houseTime } from './house-time';

/**
 * `GET /home/water/status/temperature`, in the shape of a real answer. `pumpActive` is there and
 * always false: the service does not fill it in, and the application does not show it.
 */
export const WATER_TEMPERATURES: WaterTemperatures = {
  water: { temperature: 40.56 },
  circulation: { temperature: 29.81, pumpActive: false },
};

/**
 * The same answer as `water-service` gives it since 0.6.0: with the time the sensors were read,
 * to the second. The service reads them every three minutes, so the reading is a little over a
 * minute old - a function of "now", because the page shows that time as an age. `secondsAgo`
 * is for a sensor that fell silent: the service then repeats its last row.
 */
export function waterTemperatures(now: Date = new Date(), secondsAgo = 65): WaterTemperatures {
  return { measuredAt: houseTime(now, secondsAgo).slice(0, 19), ...WATER_TEMPERATURES };
}

/** `GET /home/water/status/active`: the water is inside its band and was last heated up. */
export const WATER_HEATING_DEMAND: WaterHeatingDemand = { active: false };

/**
 * `GET /home/water/valve` (HAS-316): the valve of the garage open, a tap running, the mains at almost 5 bar - its
 * newest report a few seconds old, since the service hears the valve at once and reads it every minute.
 */
export function waterValve(now: Date = new Date(), secondsAgo = 8): WaterValve {
  const at = houseTime(now, secondsAgo).slice(0, 19);
  return {
    state: 'open',
    flowRate: 6.5,
    pressure: 4.92,
    temperature: 12.9,
    counter: { total: 61.896, measuredAt: houseTime(now, 40).slice(0, 19) },
    measuredAt: at,
  };
}

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;

/** The litres of an hour of a day of the house: a morning and an evening, nothing at night - the same every run. */
function hourLitres(day: string, hour: number): number {
  const seed = [...day].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const shape = [0, 0, 0, 0, 0, 2, 18, 45, 30, 12, 8, 10, 15, 9, 6, 7, 11, 20, 38, 42, 30, 22, 9, 3];
  return Math.round(shape[hour] * (0.8 + ((seed + hour * 7) % 9) / 20));
}

function wallDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The first day of the range of a day, as water-service counts them (a week from Monday). */
function startOf(range: string, day: string): number {
  const midnight = Date.parse(`${day}T00:00:00Z`);
  const date = new Date(midnight);
  switch (range) {
    case 'week':
      return midnight - ((date.getUTCDay() + 6) % 7) * DAY_MS;
    case 'month':
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    case 'year':
      return Date.UTC(date.getUTCFullYear(), 0, 1);
    default:
      return midnight;
  }
}

function endOf(range: string, start: number): number {
  const date = new Date(start);
  switch (range) {
    case 'week':
      return start + 7 * DAY_MS;
    case 'month':
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
    case 'year':
      return Date.UTC(date.getUTCFullYear() + 1, 0, 1);
    default:
      return start + DAY_MS;
  }
}

/** The litres of a whole day; today only up to the running hour. */
function dayLitres(day: string, today: string, hourNow: number): number {
  let litres = 0;
  for (let hour = 0; hour < 24 && (day < today || hour <= hourNow); hour += 1) {
    litres += hourLitres(day, hour);
  }
  return litres;
}

/**
 * `GET /home/water/consumption?range=&at=` (HAS-317) in the shape of a real answer: the buckets the service watched -
 * the readings begin on `firstWatched`, and nothing is known of the future - in m³ with three decimals, the total and
 * the one of the range before. An unknown range is the refusal of the service. `fresh` is a service that has watched
 * nothing yet.
 */
export function waterConsumption(
  range: string | null,
  at: string | null,
  fresh = false,
  now: Date = new Date(),
): WaterConsumption | { status: 400; message: string; code: string } {
  if (range !== 'day' && range !== 'week' && range !== 'month' && range !== 'year') {
    return {
      status: 400,
      message: `The range is day, week, month or year, not ${range}`,
      code: 'INVALID_RANGE',
    };
  }
  const nowText = houseTime(now, 0);
  const today = nowText.slice(0, 10);
  const hourNow = Number(nowText.slice(11, 13));
  const firstWatched = wallDay(Date.parse(`${today}T00:00:00Z`) - 400 * DAY_MS);
  const start = startOf(range, at ?? today);
  const end = endOf(range, start);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19);
  const buckets: { at: string; volume: number }[] = [];
  const m3 = (litres: number) => Math.round(litres) / 1_000;
  if (!fresh) {
    for (let cursor = start; cursor < end; ) {
      const day = wallDay(cursor);
      const next =
        range === 'day'
          ? cursor + HOUR_MS
          : range === 'year'
            ? Date.UTC(new Date(cursor).getUTCFullYear(), new Date(cursor).getUTCMonth() + 1, 1)
            : cursor + DAY_MS;
      const watched = day >= firstWatched && day <= today;
      if (watched && range === 'day') {
        const hour = new Date(cursor).getUTCHours();
        if (day < today || hour <= hourNow) {
          buckets.push({ at: iso(cursor), volume: m3(hourLitres(day, hour)) });
        }
      } else if (watched && range === 'year') {
        let litres = 0;
        for (let d = cursor; d < next && wallDay(d) <= today; d += DAY_MS) {
          litres += wallDay(d) >= firstWatched ? dayLitres(wallDay(d), today, hourNow) : 0;
        }
        buckets.push({ at: iso(cursor), volume: m3(litres) });
      } else if (watched) {
        buckets.push({ at: iso(cursor), volume: m3(dayLitres(day, today, hourNow)) });
      }
      cursor = next;
    }
  }
  const total = buckets.reduce((sum, bucket) => sum + bucket.volume, 0);
  return {
    range,
    from: iso(start),
    to: iso(end),
    unit: 'm3',
    ...(buckets.length === 0 ? {} : { total: Math.round(total * 1_000) / 1_000 }),
    ...(fresh ? {} : { previousTotal: Math.round(total * 1.08 * 1_000) / 1_000 }),
    buckets,
  };
}
