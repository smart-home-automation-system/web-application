import { RoomHistory } from '../app/data-access/heating/heating-api';
import { WaterHistory } from '../app/data-access/water/water-api';
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
