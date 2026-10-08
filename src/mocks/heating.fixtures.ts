import {
  HeatingActivity,
  HeatingStatus,
  TemperatureSensor,
} from '../app/data-access/heating/heating-api';
import { houseTime } from './house-time';

/** `GET /home/heating`, in the shape of a real answer, as the mock house starts. */
export const HEATING_STATUS: HeatingStatus = {
  isHeatingEnabled: true,
  updatedAt: '2026-09-28T06:45:12.840868',
};

// The one thing of the mock house that can be changed. It lives in the memory of the page: a
// reload is the house as it started.
let status = HEATING_STATUS;

export function heatingStatus(): HeatingStatus {
  return status;
}

/** `POST /home/heating?turn=on|off`: like the service, anything but "on" switches off. */
export function turnHeating(turn: string | null, now: Date = new Date()): HeatingStatus {
  status = { isHeatingEnabled: turn?.toLowerCase() === 'on', updatedAt: houseTime(now, 0) };
  return status;
}

/** Back to the house as it starts - for a test that switched. */
export function resetHeating(): void {
  status = HEATING_STATUS;
}

/**
 * `GET /home/heating/status/active`: the service says "active" while the system is switched on
 * and a room is being heated - in the mock house one always is.
 */
export function heatingActivity(): HeatingActivity {
  return { active: status.isHeatingEnabled === true };
}

const MINUTE = 60;
const DAY = 24 * 60 * MINUTE;

/**
 * `GET /home/heating/temperature/sensors`, in the shape of a real answer: most rooms reported a
 * few minutes ago, one sensor has been silent for three days, and one - silent for weeks - is
 * muted, as a retired sensor is. The room identifiers are the public ones of `smart-home-sdk`.
 */
export function temperatureSensors(now: Date = new Date()): TemperatureSensor[] {
  // each a little older than a round age: the page counts from a clock that ticks every few
  // seconds, and "2 min ago" must not read "1 min ago" in the moment after the call
  const sensor = (room: string, secondsAgo: number, stale = false, muted = false) => ({
    room,
    lastReadingAt: houseTime(now, secondsAgo + 20),
    stale,
    muted,
  });
  return [
    sensor('office', 2 * MINUTE),
    sensor('living room', 4 * MINUTE),
    sensor('bedroom', MINUTE),
    sensor('wardrobe', 3 * MINUTE),
    sensor('bathroom up', 5 * MINUTE),
    sensor('loft', 6 * MINUTE),
    sensor('garden', 47 * DAY, true, true),
    sensor('bathroom down', 3 * DAY, true),
  ];
}
