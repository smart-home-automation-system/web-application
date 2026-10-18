import { BlindSchedule, ScheduleToday } from '../app/data-access/blinds/blind-schedule';
import type { MockReply } from './handlers';
import { houseTime } from './house-time';

/**
 * The schedules of the mock blinds (`blinds-service`), which can be switched on and off: a switch
 * changes what the next read answers, in the memory of the page. The targets are the blinds of
 * `blinds.fixtures.ts` - a room, and one blind by its id. What the engine makes of each today is
 * a fixed picture: one fired this morning, one waiting for the weather, one switched off.
 */
const AT_THE_START: readonly BlindSchedule[] = [
  {
    id: 1,
    name: 'Morning light',
    enabled: true,
    dayType: 'workday',
    window: {
      from: { kind: 'clock', time: '06:30' },
      to: { kind: 'sunrise', offsetMinutes: 60, latest: '09:00' },
    },
    targets: [{ room: 'office' }],
    conditions: [{ metric: 'illuminance', operator: 'gt', threshold: 50, holdMinutes: 5 }],
    action: 'open',
  },
  {
    id: 2,
    name: 'Summer shade',
    enabled: true,
    dayType: 'any',
    window: { from: { kind: 'clock', time: '11:00' }, to: { kind: 'clock', time: '17:00' } },
    targets: [{ deviceId: 1 }],
    conditions: [
      { metric: 'outside temperature', operator: 'gt', threshold: 25, holdMinutes: 15 },
      { metric: 'window closed', operator: 'is', value: true, holdMinutes: 0 },
    ],
    action: 'position',
    position: 30,
  },
  {
    id: 3,
    name: 'Night close',
    enabled: false,
    dayType: 'day off',
    window: {
      from: { kind: 'sunset', offsetMinutes: -15, earliest: '16:00' },
      to: { kind: 'clock', time: '01:00' },
    },
    targets: [{ room: 'living room' }],
    conditions: [],
    action: 'close',
  },
];

let schedules: BlindSchedule[] = AT_THE_START.map((one) => ({ ...one }));

/** For a unit test that switched a schedule. */
export function resetSchedules(): void {
  schedules = AT_THE_START.map((one) => ({ ...one }));
}

export function allSchedules(): BlindSchedule[] {
  return schedules;
}

const notFound: MockReply = {
  status: 404,
  body: { errors: [{ message: 'Schedule not found', code: 'NOT_FOUND_SCHEDULE' }] },
};

export function enableSchedule(id: string, enabled: boolean): MockReply {
  const index = schedules.findIndex((schedule) => String(schedule.id) === id);
  if (index < 0) {
    return notFound;
  }
  schedules[index] = { ...schedules[index], enabled };
  return { status: 200, body: schedules[index] };
}

/** What the engine makes of a schedule now; the times of the day are fixed, the ages follow the clock. */
export function scheduleToday(id: string, now: Date = new Date()): MockReply {
  const schedule = schedules.find((one) => String(one.id) === id);
  if (!schedule) {
    return notFound;
  }
  const date = houseTime(now, 0).slice(0, 10);
  const today = (rest: Omit<ScheduleToday, 'scheduleId' | 'date'>): MockReply => ({
    status: 200,
    body: { scheduleId: schedule.id, date, ...rest },
  });
  const disabled = schedule.enabled === false ? { decision: 'disabled' } : undefined;
  switch (schedule.id) {
    case 1:
      return today({
        dayType: 'workday',
        dayTypeFromCalendar: true,
        runsToday: true,
        window: { from: '06:30', to: '08:12' },
        conditions: [
          {
            metric: 'illuminance',
            operator: 'gt',
            threshold: 50,
            holdMinutes: 5,
            current: 18_400,
            measuredAt: houseTime(now, 65),
            trueSince: houseTime(now, 4 * 3600 + 5),
            state: 'met',
          },
        ],
        targets: [
          {
            deviceId: 2,
            name: 'Office door blinds',
            room: 'office',
            window: 'no sensor',
            firedAt: houseTime(now, 3 * 3600 + 5),
            outcome: 'paused',
          },
          {
            deviceId: 1,
            name: 'Office window blinds',
            room: 'office',
            window: 'closed',
            firedAt: houseTime(now, 3 * 3600 + 5),
            outcome: 'moved',
          },
        ],
        decision: disabled?.decision ?? 'fired today',
      });
    case 2:
      return today({
        dayType: 'workday',
        dayTypeFromCalendar: true,
        runsToday: true,
        window: { from: '11:00', to: '17:00' },
        conditions: [
          {
            metric: 'outside temperature',
            operator: 'gt',
            threshold: 25,
            holdMinutes: 15,
            current: 21.4,
            measuredAt: houseTime(now, 65),
            state: 'not met',
          },
          {
            metric: 'window closed',
            operator: 'is',
            value: true,
            holdMinutes: 0,
            state: 'per blind',
          },
        ],
        targets: [
          {
            deviceId: 1,
            name: 'Office window blinds',
            room: 'office',
            window: 'closed',
            windowClosed: 'met',
          },
        ],
        decision: disabled?.decision ?? 'waiting for the conditions',
      });
    default:
      return today({
        dayType: 'workday',
        dayTypeFromCalendar: true,
        runsToday: false,
        window: { from: '16:43', to: '01:00', nextDay: true },
        conditions: [],
        targets: [
          {
            deviceId: 7,
            name: 'Living room terrace blinds',
            room: 'living room',
            window: 'no sensor',
          },
        ],
        decision: disabled?.decision ?? 'not today',
      });
  }
}
