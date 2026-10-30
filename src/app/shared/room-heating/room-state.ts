import { MessageKey } from '../../i18n/messages';
import { RoomView, SchedulePeriod, clockTime } from './room-views';

/**
 * The heating of a room in one word (HAS-353), the first that holds:
 * 1. `systemOff` - the heating of the house is switched off;
 * 2. `held` - a window or a door holds the heating of the room;
 * 3. `heating` - a heater of the room is working;
 * 4. `unknown` - no temperature, or a heater without a status: missing is never off;
 * 5. `waiting` - a schedule covers the room now and it is colder than asked, nothing works yet;
 * 6. `reached` - a schedule covers the room now and it is as warm as asked, or warmer;
 * 7. `outside` - no schedule covers the room now.
 * `noHeater` stands apart: a room without a heater (the loft, the garden) has no heating to tell.
 *
 * "A schedule covers the room" is the service's `scheduledTemperature` (the `target` of the view): it is
 * there whenever a period is on. Not `inSchedule`, which the service sets only while the room is below its
 * target - it cannot tell "reached" from "outside".
 */
export type RoomState =
  | 'systemOff'
  | 'held'
  | 'heating'
  | 'unknown'
  | 'waiting'
  | 'reached'
  | 'outside'
  | 'noHeater';

export function roomState(room: RoomView, systemOn: boolean | undefined): RoomState {
  if (room.heaters?.length === 0) {
    return 'noHeater';
  }
  if (systemOn === false) {
    return 'systemOff';
  }
  if (room.window?.hold === true) {
    return 'held';
  }
  if (room.heaters?.some((heater) => heater.working === true)) {
    return 'heating';
  }
  if (
    room.temperature === undefined ||
    room.heaters === undefined ||
    room.heaters.some((heater) => heater.working === undefined)
  ) {
    return 'unknown';
  }
  if (room.target === undefined) {
    return 'outside';
  }
  return room.temperature < room.target ? 'waiting' : 'reached';
}

export const ROOM_STATE_LABELS: Readonly<Record<RoomState, MessageKey>> = {
  systemOff: 'heating.state.systemOff',
  held: 'heating.state.held',
  heating: 'heating.state.heating',
  unknown: 'heating.state.unknown',
  waiting: 'heating.state.waiting',
  reached: 'heating.state.reached',
  outside: 'heating.state.outside',
  noHeater: 'heating.state.noHeater',
};

/** Name of a Material Symbols icon. */
export const ROOM_STATE_ICONS: Readonly<Record<RoomState, string>> = {
  systemOff: 'mode_heat_off',
  held: 'window',
  heating: 'local_fire_department',
  unknown: 'help',
  waiting: 'hourglass_top',
  reached: 'check_circle',
  outside: 'bedtime',
  noHeater: 'remove',
};

/** The states the legend lists, in the order of their precedence. */
export const LEGEND_STATES: readonly RoomState[] = [
  'heating',
  'waiting',
  'reached',
  'outside',
  'held',
  'unknown',
];

/**
 * Whether a schedule covers the room now (the LED next to its name): `on` while the service says what a
 * schedule asks for, `off` while it says none does, `unknown` when the answer lists no heaters.
 */
export type ScheduleLed = 'on' | 'off' | 'unknown';

export function scheduleLed(room: RoomView): ScheduleLed {
  if (room.heaters === undefined) {
    return 'unknown';
  }
  return room.target !== undefined ? 'on' : 'off';
}

/**
 * The window of the schedule that is on now, for the tooltip of the LED - `07:00–23:00 · 20.5 °C` - from the
 * periods already in the answer: the one of the highest temperature among those that cover the moment, as
 * the service takes the highest. `undefined` when none of the periods covers it (the clock of the browser is
 * not the house's; the LED itself is the service's word). Ends are exclusive, as in the service.
 */
export function currentWindow(
  room: RoomView,
  moment: { readonly day: number; readonly minute: number },
): SchedulePeriod | undefined {
  return (room.heaters ?? [])
    .flatMap((heater) => heater.periods ?? [])
    .filter(
      (period) =>
        period.days.includes(moment.day) && period.start < moment.minute && moment.minute < period.end,
    )
    .reduce<SchedulePeriod | undefined>(
      (highest, period) =>
        highest === undefined || period.temperature > highest.temperature ? period : highest,
      undefined,
    );
}

/** `07:00–23:00` - the times are the same in every language; the temperature is formatted by the caller. */
export function windowTimes(period: SchedulePeriod): string {
  return `${clockTime(period.start)}–${clockTime(period.end)}`;
}

/**
 * How far the temperature is from the target, for the line under it: `below` and `above` by more than half a
 * degree, `near` within it; `undefined` without a target or a reading.
 */
export function targetDistance(room: RoomView): 'below' | 'near' | 'above' | undefined {
  if (room.temperature === undefined || room.target === undefined) {
    return undefined;
  }
  const difference = room.temperature - room.target;
  if (difference < -0.5) {
    return 'below';
  }
  return difference > 0.5 ? 'above' : 'near';
}
