import { RoomHistory } from '../app/data-access/heating/heating-api';
import { WaterHistory } from '../app/data-access/water/water-api';
import { WeatherHistory } from '../app/data-access/weather/weather-api';
import { houseTime } from './house-time';

/** A refusal of a range, as the services answer it: a 400 with the reason, without a code. */
export interface HistoryRefusal {
  readonly status: 400;
  readonly message: string;
}

export function isHistoryRefusal(answer: object): answer is HistoryRefusal {
  return 'status' in answer;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The widths the two services cut a range into: up to 2 days, up to 8, up to 31. */
const WATER_BUCKETS = [5 * MINUTE, 30 * MINUTE, 2 * HOUR] as const;
const ROOM_BUCKETS = [20 * MINUTE, HOUR, 3 * HOUR] as const;

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/** Seconds on the wall-clock timeline: every day 24 hours long, as the services bucket. */
const wallClock = (dateTime: string) => Date.parse(`${dateTime}Z`) / 1_000;
const localDateTime = (seconds: number) => new Date(seconds * 1_000).toISOString().slice(0, 19);

interface Range {
  readonly from: number;
  readonly to: number;
  readonly bucket: number;
}

/** The rules of both services: both bounds, local date-times, in order, at most 31 days. */
function readRange(
  from: string | null,
  to: string | null,
  buckets: readonly [number, number, number],
): Range | HistoryRefusal {
  if (from === null || to === null) {
    return { status: 400, message: "Required query parameter 'from' or 'to' is not present." };
  }
  if (!LOCAL_DATE_TIME.test(from) || !LOCAL_DATE_TIME.test(to)) {
    return { status: 400, message: 'Type mismatch.' };
  }
  const start = wallClock(from);
  const end = wallClock(to);
  if (start >= end) {
    return { status: 400, message: 'from must be before to' };
  }
  if (end - start > 31 * DAY) {
    return { status: 400, message: 'The range must not be longer than 31 days' };
  }
  const length = end - start;
  return {
    from: start,
    to: end,
    bucket: length <= 2 * DAY ? buckets[0] : length <= 8 * DAY ? buckets[1] : buckets[2],
  };
}

/**
 * The starts of the buckets that have a reading: aligned to the clock of the house, up to the
 * moment of the call, and none in the small hours of yesterday - **the sensor of the mock house
 * was silent yesterday from 03:00 to 04:00**, so every history has a gap to draw.
 */
function buckets(range: Range, now: Date): number[] {
  const current = wallClock(houseTime(now, 0).slice(0, 19));
  const silentFrom = Math.floor(current / DAY) * DAY - DAY + 3 * HOUR;
  const silentTo = silentFrom + HOUR;
  const starts: number[] = [];
  for (
    let at = Math.floor(range.from / range.bucket) * range.bucket;
    at < range.to && at <= current;
    at += range.bucket
  ) {
    // a bucket that lies wholly inside the silence has nothing to average
    if (at >= silentFrom && at + range.bucket <= silentTo) {
      continue;
    }
    starts.push(at);
  }
  return starts;
}

const round = (value: number) => Math.round(value * 100) / 100;
/** Where in its day a moment lies, as an angle. */
const dayAngle = (seconds: number) => ((seconds % DAY) / DAY) * 2 * Math.PI;

/**
 * `GET /home/water/temperature/history`, in the shape of a real answer: a tank that is heated
 * up twice a day and cools in between, around the band it is kept in, and a circulation that
 * follows it some degrees lower. Invented values. `fresh` is a service without a stored reading.
 */
export function waterHistory(
  from: string | null,
  to: string | null,
  fresh: boolean,
  now: Date = new Date(),
): WaterHistory | HistoryRefusal {
  const range = readRange(from, to, WATER_BUCKETS);
  if (isHistoryRefusal(range)) {
    return range;
  }
  return {
    from: localDateTime(range.from),
    to: localDateTime(range.to),
    bucketSeconds: range.bucket,
    points: fresh
      ? []
      : buckets(range, now).map((at) => ({
          at: localDateTime(at),
          water: round(41 + 4 * Math.sin(2 * dayAngle(at))),
          circulation: round(28 + 3 * Math.sin(2 * dayAngle(at) - 0.6)),
        })),
  };
}

/**
 * `GET /home/heating/rooms/{name}/temperature/history`, in the shape of a real answer: a room
 * that is warmest in the evening and coolest before dawn. Invented values; the room is named
 * as it was asked for, which the caller has checked to be a room of the mock house.
 */
export function roomHistory(
  room: string,
  from: string | null,
  to: string | null,
  fresh: boolean,
  now: Date = new Date(),
): RoomHistory | HistoryRefusal {
  const range = readRange(from, to, ROOM_BUCKETS);
  if (isHistoryRefusal(range)) {
    return range;
  }
  // a different level per room, so that two rooms do not share one line
  const level = 20 + (room.length % 4) * 0.5;
  return {
    room,
    from: localDateTime(range.from),
    to: localDateTime(range.to),
    bucketSeconds: range.bucket,
    points: fresh
      ? []
      : buckets(range, now).map((at) => ({
          at: localDateTime(at),
          value: round(level + 1.2 * Math.sin(dayAngle(at) - 2.4)),
        })),
  };
}

/** The metrics `weather-service` stores, by the names of its read API. */
const WEATHER_METRICS = [
  'battery',
  'pressure',
  'illuminance',
  'dewPoint',
  'voltage',
  'raining',
  'humidity',
  'wind',
  'gust',
  'temperature',
  'uv',
  'windDirection',
  'precipitation',
] as const;

/** A refusal of `weather-service` with its code: the metric it does not know. */
export interface WeatherHistoryRefusal extends HistoryRefusal {
  readonly code: 'UNKNOWN_METRIC';
}

/** The hour of the day of a moment on the wall clock, with its fraction. */
const hourOf = (seconds: number) => (seconds % DAY) / HOUR;
/** A wave over the day with its peak at `peak` o'clock. */
const daily = (seconds: number, peak: number) =>
  Math.cos((2 * Math.PI * (hourOf(seconds) - peak)) / 24);
/** Daylight: nothing before 07:00 and after 18:00, the most at half past twelve. */
const daylight = (seconds: number) => {
  const hour = hourOf(seconds);
  return hour <= 7 || hour >= 18 ? 0 : 32_000 * Math.sin((Math.PI * (hour - 7)) / 11);
};
/** The mock garden gets an hour of rain every other morning, from 05:00 to 06:00. */
const rainingAt = (seconds: number) =>
  Math.floor(seconds / DAY) % 2 === 0 && hourOf(seconds) >= 5 && hourOf(seconds) < 6;
/** The running total of the rain gauge: 1200 at the start of time, 24 for every hour of rain. */
const gaugeAt = (seconds: number) => {
  const days = Math.floor(seconds / DAY);
  const rainyDaysBefore = Math.ceil(days / 2);
  const hour = hourOf(seconds);
  const today = days % 2 === 0 ? Math.min(Math.max(hour - 5, 0), 1) : 0;
  return 1200 + 24 * (rainyDaysBefore + today);
};

/** One bucket of one metric: its average, and the lowest and highest reading. */
function weatherBucket(
  metric: (typeof WEATHER_METRICS)[number],
  at: number,
  width: number,
): { avg: number; min?: number; max?: number } {
  const spread = (avg: number, by: number) => ({
    avg: round(avg),
    min: round(avg - by),
    max: round(avg + by),
  });
  const middle = at + width / 2;
  switch (metric) {
    case 'temperature':
      return spread(9 + 5 * daily(middle, 15), 0.3);
    case 'dewPoint':
      return spread(5.5 + 1.5 * daily(middle, 15), 0.2);
    case 'humidity':
      return spread(76 - 16 * daily(middle, 15), 1);
    case 'illuminance': {
      const low = daylight(at);
      const high = daylight(at + width);
      return {
        avg: round(daylight(middle)),
        min: round(Math.min(low, high)),
        max: round(Math.max(low, high, daylight(middle))),
      };
    }
    case 'wind':
      return spread(2.6 + 1.4 * daily(middle, 14) + 0.4 * Math.sin(middle / 1_700), 0.5);
    case 'gust':
      return spread(4.2 + 2.2 * daily(middle, 14) + 0.8 * Math.sin(middle / 1_100), 1.2);
    case 'windDirection':
      // a circular mean: no lowest and no highest
      return { avg: round((230 + 70 * Math.sin(middle / 40_000) + 360) % 360) };
    case 'pressure':
      return spread(1009 + 4 * Math.sin(middle / ((3 * DAY) / (2 * Math.PI))), 0.15);
    case 'precipitation':
      return {
        avg: round((gaugeAt(at) + gaugeAt(at + width)) / 2),
        min: gaugeAt(at),
        max: gaugeAt(at + width),
      };
    case 'raining':
      return {
        avg: rainingAt(middle) ? 1 : 0,
        min: rainingAt(at) ? 1 : 0,
        max: rainingAt(middle) ? 1 : 0,
      };
    case 'uv':
      return spread(round(daylight(middle) / 9_000), 0);
    case 'battery':
      return spread(98, 0);
    case 'voltage':
      return spread(5.1, 0);
  }
}

/**
 * `GET /home/weather/history?metric=&from=&to=`, in the shape of a real answer: a garden with a
 * day and a night - the warmest afternoon, daylight from seven to six, a wind that rises after
 * noon, an hour of rain every other morning on the running total of the gauge - and the hour of
 * yesterday the station of the mock house was silent. Invented values. An unknown metric is
 * refused as the service refuses it, with its code.
 */
export function weatherHistory(
  metric: string | null,
  from: string | null,
  to: string | null,
  fresh: boolean,
  now: Date = new Date(),
): WeatherHistory | HistoryRefusal | WeatherHistoryRefusal {
  const known = WEATHER_METRICS.find((name) => name === metric);
  if (known === undefined) {
    return { status: 400, message: 'Unknown metric', code: 'UNKNOWN_METRIC' };
  }
  const range = readRange(from, to, WATER_BUCKETS);
  if (isHistoryRefusal(range)) {
    return range;
  }
  return {
    metric: known,
    from: localDateTime(range.from),
    to: localDateTime(range.to),
    bucketSeconds: range.bucket,
    points: fresh
      ? []
      : buckets(range, now).map((at) => ({
          at: localDateTime(at),
          ...weatherBucket(known, at, range.bucket),
        })),
  };
}
