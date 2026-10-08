import { houseWeekMinute } from '../app/core/time/house-date-time';
import {
  FloorPump,
  HeaterSchedule,
  HeatingActivity,
  HeatingStatus,
  Room,
  RoomHeater,
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

/** `GET /home/heating/floor-pump`, once the relay of the pump has answered. */
export function floorPump(now: Date = new Date()): FloorPump {
  return { working: true, updatedAt: houseTime(now, 2 * MINUTE + 5) };
}

const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const WEEKEND = ['SATURDAY', 'SUNDAY'];
const DAY_NAMES = [...WEEKDAYS, ...WEEKEND];

const period = (
  days: readonly string[],
  startTime: string,
  endTime: string,
  temperature: number,
): HeaterSchedule => ({ type: 'HEATING', days, startTime, endTime, temperature });

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/**
 * What the service works out for a heater at the moment of the call: the highest temperature of
 * the periods that are on - both ends of a period excluded - or nothing.
 */
function scheduledNow(schedules: readonly HeaterSchedule[], now: Date): number | undefined {
  const { day, minute } = houseWeekMinute(now.getTime(), 'Europe/Warsaw');
  const on = schedules.filter(
    (schedule) =>
      schedule.days!.includes(DAY_NAMES[day]) &&
      toMinutes(schedule.startTime!) < minute &&
      minute < toMinutes(schedule.endTime!),
  );
  return on.length > 0 ? Math.max(...on.map((schedule) => schedule.temperature!)) : undefined;
}

/**
 * `GET /home/heating/rooms`, in the shape of a real answer. The mock house has every case the
 * page has to show: a room that is being heated, rooms that are warm enough, one outside its
 * schedule for part of the day, heaters whose relay has not answered, a room with two heaters,
 * rooms without a heater, a heater without a schedule, a reading that is weeks old and a room
 * that never reported. `fresh` is the service just after its first start: it knows its rooms
 * and their schedules, has measured nothing, heard from no relay and decided nothing - only
 * the temperature a schedule asks for is there, because the service works it out when asked.
 * The room identifiers are the public ones of `smart-home-sdk`.
 */
export function heatingRooms(now: Date = new Date(), fresh = false): Room[] {
  const heater = (
    type: string,
    schedules: readonly HeaterSchedule[],
    // undefined: the relay has not answered, and nothing was decided for the heater
    state?: { working: boolean; secondsAgo: number },
    roomTemperature?: number,
  ): RoomHeater => {
    const scheduled = scheduledNow(schedules, now);
    const calls =
      scheduled !== undefined && roomTemperature !== undefined && roomTemperature < scheduled;
    return {
      type,
      ...(state && !fresh
        ? {
            working: state.working,
            updatedAt: houseTime(now, state.secondsAgo + 20),
            inSchedule: calls,
            ...(calls ? { targetTemperature: scheduled } : {}),
          }
        : {}),
      ...(scheduled !== undefined ? { scheduledTemperature: scheduled } : {}),
      schedules,
    };
  };
  const room = (
    name: string,
    reading: { value: number; secondsAgo: number } | undefined,
    heaters: (temperature: number | undefined) => RoomHeater[],
  ): Room => {
    const measured = fresh ? undefined : reading;
    const built = heaters(measured?.value);
    return {
      name,
      mode: 'HEATING',
      ...(built.some((one) => one.working !== undefined)
        ? { heatingEnabled: built.some((one) => one.working === true) }
        : {}),
      ...(measured
        ? {
            temperature: {
              value: measured.value,
              updatedAt: houseTime(now, measured.secondsAgo + 20),
            },
          }
        : {}),
      heaters: built,
    };
  };

  const allDay = [period(DAY_NAMES, '00:01:00', '23:59:00', 21.5)];
  const livingRoom = [
    period(WEEKDAYS, '06:00:00', '08:00:00', 21),
    period(WEEKDAYS, '15:00:00', '22:00:00', 21.5),
    period(WEEKEND, '08:00:00', '22:30:00', 21.5),
  ];
  const office = [period(WEEKDAYS, '07:00:00', '17:00:00', 20.5)];
  const bedroom = [
    period(DAY_NAMES, '05:30:00', '07:00:00', 19),
    period(DAY_NAMES, '21:00:00', '23:00:00', 18),
  ];
  const bathroom = [period(DAY_NAMES, '05:00:00', '23:00:00', 23)];

  return [
    room('office', { value: 21.3, secondsAgo: 2 * MINUTE }, () => [
      heater('radiator', office, { working: false, secondsAgo: 2 * MINUTE }, 21.3),
    ]),
    room('bedroom', { value: 19.6, secondsAgo: MINUTE }, () => [
      heater('radiator', bedroom, { working: false, secondsAgo: MINUTE }, 19.6),
    ]),
    // a relay that has not answered since the start of the service: no status, nothing decided
    room('wardrobe', { value: 20.9, secondsAgo: 3 * MINUTE }, () => [heater('floor', allDay)]),
    room('bathroom up', { value: 22.1, secondsAgo: 5 * MINUTE }, (temperature) => [
      heater('radiator', bathroom, { working: true, secondsAgo: 5 * MINUTE }, temperature),
      heater('floor', bathroom, { working: true, secondsAgo: 5 * MINUTE }, temperature),
    ]),
    room('loft', { value: 20.2, secondsAgo: 6 * MINUTE }, () => []),
    room('living room', { value: 20.4, secondsAgo: 4 * MINUTE }, (temperature) => [
      heater('radiator', allDay, { working: true, secondsAgo: 4 * MINUTE }, temperature),
      heater('floor', livingRoom, { working: false, secondsAgo: 4 * MINUTE }, 30),
    ]),
    // a heater the service has no schedule for
    room('bathroom down', { value: 18.4, secondsAgo: 3 * DAY }, () => [
      heater('radiator', [], { working: false, secondsAgo: 3 * DAY }, 18.4),
    ]),
    room('sauna', undefined, () => []),
    room('garden', { value: 7.5, secondsAgo: 47 * DAY }, () => []),
  ];
}
