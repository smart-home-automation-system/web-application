import {
  WaterConsumption,
  WaterHeatingDemand,
  WaterBill,
  WaterTemperatures,
  WaterValve,
} from '../app/data-access/water/water-api';
import type { MockReply } from './handlers';
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
/** The valve of the mock house: open until the dashboard closes it (HAS-323), its last command confirmed at once. */
let valveOpen = true;
let valveCommanded = false;

export function resetWaterValve(): void {
  valveOpen = true;
  valveCommanded = false;
}

/** `POST /home/water/valve?state=&source=` (HAS-321): taken, the valve in the state asked - 202 with what was taken. */
export function commandWaterValve(state: string | null, source: string | null): MockReply {
  if (state !== 'open' && state !== 'close') {
    return refusal(
      400,
      'INVALID_COMMAND',
      'Invalid valve command',
      `The state is open or close, not ${state}`,
    );
  }
  valveOpen = state === 'open';
  valveCommanded = true;
  return {
    status: 202,
    body: { state, source, commandedAt: houseTime(new Date(), 0).slice(0, 19) },
  };
}

export function waterValve(now: Date = new Date(), secondsAgo = 8): WaterValve {
  const at = houseTime(now, secondsAgo).slice(0, 19);
  return {
    state: valveOpen ? 'open' : 'closed',
    ...(valveCommanded ? { lastCommandConfirmed: true } : {}),
    flowRate: valveOpen ? 6.5 : 0,
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
  const seed = [...day].reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0);
  const shape = [
    0, 0, 0, 0, 0, 2, 18, 45, 30, 12, 8, 10, 15, 9, 6, 7, 11, 20, 38, 42, 30, 22, 9, 3,
  ];
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

/** What the mock house knows on a day: the readings begin on `firstWatched`, nothing is known of the future. */
interface Watch {
  readonly today: string;
  readonly hourNow: number;
  readonly firstWatched: string;
}

function watchOf(now: Date): Watch {
  const nowText = houseTime(now, 0);
  const today = nowText.slice(0, 10);
  return {
    today,
    hourNow: Number(nowText.slice(11, 13)),
    firstWatched: wallDay(Date.parse(`${today}T00:00:00Z`) - 400 * DAY_MS),
  };
}

/** The start of the bucket after one: an hour of a day, a month of a year, a day otherwise. */
function nextBucket(range: string, cursor: number): number {
  if (range === 'day') {
    return cursor + HOUR_MS;
  }
  if (range === 'year') {
    const date = new Date(cursor);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  }
  return cursor + DAY_MS;
}

/** The litres of one bucket, or `undefined` when the counter was not watched in it. */
function bucketLitres(
  range: string,
  cursor: number,
  next: number,
  watch: Watch,
): number | undefined {
  const day = wallDay(cursor);
  if (day < watch.firstWatched || day > watch.today) {
    return undefined;
  }
  if (range === 'day') {
    const hour = new Date(cursor).getUTCHours();
    return day < watch.today || hour <= watch.hourNow ? hourLitres(day, hour) : undefined;
  }
  if (range === 'year') {
    let litres = 0;
    for (let at = cursor; at < next && wallDay(at) <= watch.today; at += DAY_MS) {
      litres +=
        wallDay(at) >= watch.firstWatched ? dayLitres(wallDay(at), watch.today, watch.hourNow) : 0;
    }
    return litres;
  }
  return dayLitres(day, watch.today, watch.hourNow);
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19);
const m3 = (litres: number) => Math.round(litres) / 1_000;

/**
 * `GET /home/water/consumption?range=&at=` (HAS-317) in the shape of a real answer: the buckets the service watched,
 * in m³ with three decimals, the total and the one of the range before. An unknown range is the refusal of the
 * service. `fresh` is a service that has watched nothing yet.
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
  const watch = watchOf(now);
  const start = startOf(range, at ?? watch.today);
  const end = endOf(range, start);
  const buckets: { at: string; volume: number }[] = [];
  for (let cursor = start; !fresh && cursor < end; cursor = nextBucket(range, cursor)) {
    const litres = bucketLitres(range, cursor, nextBucket(range, cursor), watch);
    if (litres !== undefined) {
      buckets.push({ at: iso(cursor), volume: m3(litres) });
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

const refusal = (status: number, code: string, message: string, details: string): MockReply => ({
  status,
  body: { errors: [{ code, message, details }] },
});

/** Two bills of the mock house, invented: one far from what the valve measured, one close to it. */
const BILLS_AT_THE_START: readonly WaterBill[] = [
  {
    id: 2,
    periodFrom: '2026-09-29',
    periodTo: '2026-10-20',
    billedVolume: 11,
    meterReading: 398,
    amount: 275.56,
    note: 'Invented bill 2',
  },
  { id: 1, periodFrom: '2026-07-30', periodTo: '2026-08-31', billedVolume: 18, amount: 470.23 },
];

let bills: WaterBill[] = BILLS_AT_THE_START.map((bill) => ({ ...bill }));

export function resetWaterBills(): void {
  bills = BILLS_AT_THE_START.map((bill) => ({ ...bill }));
}

/** What the mock valve measured over a period: about what was billed, the first bill a good deal less. */
function measured(bill: WaterBill): Partial<WaterBill> {
  const billed = bill.billedVolume ?? 0;
  const factor = bill.id === 1 ? 0.82 : 1.002;
  const measuredVolume = Math.round(billed * factor * 1_000) / 1_000;
  const difference = Math.round((measuredVolume - billed) * 1_000) / 1_000;
  return {
    measuredVolume,
    difference,
    ...(billed === 0 ? {} : { differencePercent: Math.round((difference / billed) * 1_000) / 10 }),
  };
}

/** `GET /home/water/bills` (HAS-318): newest first, each with what was measured over it. */
export function waterBills(): WaterBill[] {
  return [...bills]
    .sort((a, b) => (b.periodFrom ?? '').localeCompare(a.periodFrom ?? ''))
    .map((bill) => ({ ...bill, ...measured(bill) }));
}

function billProblem(body: unknown, id?: number): string | undefined {
  const bill = (body ?? {}) as WaterBill;
  if (!bill.periodFrom || !bill.periodTo || bill.billedVolume === undefined) {
    return 'periodFrom, periodTo and billedVolume are required';
  }
  if (bill.periodTo < bill.periodFrom) {
    return 'periodTo must not be before periodFrom';
  }
  const from = bill.periodFrom;
  const to = bill.periodTo;
  const other = bills.find(
    (one) => one.id !== id && (one.periodFrom ?? '') <= to && from <= (one.periodTo ?? ''),
  );
  return other ? `The period overlaps the bill ${other.id}` : undefined;
}

const billOf = (body: unknown): WaterBill => {
  const bill = body as WaterBill;
  return {
    periodFrom: bill.periodFrom,
    periodTo: bill.periodTo,
    billedVolume: bill.billedVolume,
    ...(bill.meterReading === undefined ? {} : { meterReading: bill.meterReading }),
    ...(bill.amount === undefined ? {} : { amount: bill.amount }),
    ...(bill.note === undefined ? {} : { note: bill.note }),
  };
};

/** `POST /home/water/bills`, refused as the service refuses it. */
export function createWaterBill(body: unknown): MockReply {
  const problem = billProblem(body);
  if (problem !== undefined) {
    return refusal(400, 'INVALID_BILL', 'Invalid water bill', problem);
  }
  const created = { id: Math.max(0, ...bills.map((bill) => bill.id ?? 0)) + 1, ...billOf(body) };
  bills = [...bills, created];
  return { status: 201, body: { ...created, ...measured(created) } };
}

/** `PUT /home/water/bills/{id}`: the whole bill. */
export function replaceWaterBill(id: string, body: unknown): MockReply {
  const current = bills.find((bill) => String(bill.id) === id);
  if (current === undefined) {
    return refusal(404, 'NOT_FOUND_BILL', 'Water bill not found', `No water bill ${id}`);
  }
  const problem = billProblem(body, current.id);
  if (problem !== undefined) {
    return refusal(400, 'INVALID_BILL', 'Invalid water bill', problem);
  }
  const replaced = { id: current.id, ...billOf(body) };
  bills = bills.map((bill) => (bill.id === current.id ? replaced : bill));
  return { status: 200, body: { ...replaced, ...measured(replaced) } };
}

/** `DELETE /home/water/bills/{id}`. */
export function deleteWaterBill(id: string): MockReply {
  if (!bills.some((bill) => String(bill.id) === id)) {
    return refusal(404, 'NOT_FOUND_BILL', 'Water bill not found', `No water bill ${id}`);
  }
  bills = bills.filter((bill) => String(bill.id) !== id);
  return { status: 204, body: null };
}
