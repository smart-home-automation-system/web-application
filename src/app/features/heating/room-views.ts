import { isRecord } from '../../core/util/is-record';
import { MessageKey } from '../../i18n/messages';

/** A period of a heater's week, read out of the answer. Times are minutes since midnight. */
export interface SchedulePeriod {
  /** Days of the week it is on, Monday being 0, in order. */
  readonly days: readonly number[];
  readonly start: number;
  readonly end: number;
  readonly temperature: number;
}

export type HeaterKind = 'radiator' | 'floor' | 'other';

/** A heater of a room as its card shows it. */
export interface HeaterView {
  readonly kind: HeaterKind;
  /** The relay is on; `undefined` when the service does not say - never read as "off". */
  readonly working: boolean | undefined;
  /** House wall-clock time of that report of the relay. */
  readonly reportedAt?: string;
  /**
   * The control loop wants this heater on: a period is on and the room is colder than it asks.
   * `undefined` until the service has decided it.
   */
  readonly callsForHeat: boolean | undefined;
  /**
   * The periods of its week; `undefined` when the answer carries no list - which is not the same
   * as a heater without a schedule, an empty list.
   */
  readonly periods: readonly SchedulePeriod[] | undefined;
  /** Entries of the list that are not a period this application can draw. */
  readonly unreadablePeriods: number;
}

/** A room as its card shows it. */
export interface RoomView {
  /** The identifier of the room in the backend, printed as it is. */
  readonly name: string;
  /** The last reading; `undefined` for a room that never reported. */
  readonly temperature?: number;
  /** House wall-clock time of that reading. */
  readonly measuredAt?: string;
  /**
   * What the schedules ask for right now, by the clock of the service - the highest of its
   * heaters. `undefined` when no period is on.
   */
  readonly target?: number;
  /** `undefined` when the answer carries no list of heaters; empty for a room without one. */
  readonly heaters: readonly HeaterView[] | undefined;
}

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** `07:00:00` as minutes since midnight. */
function minutes(value: unknown): number | undefined {
  const match =
    typeof value === 'string' ? /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value) : null;
  if (!match) {
    return undefined;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? hour * 60 + minute : undefined;
}

function toPeriod(entry: unknown): SchedulePeriod | undefined {
  if (!isRecord(entry) || !Array.isArray(entry['days'])) {
    return undefined;
  }
  // The service knows cooling periods too, and nothing here could draw one as what it is: a
  // period of another type is not shown as heating.
  if (entry['type'] !== undefined && entry['type'] !== 'HEATING') {
    return undefined;
  }
  const days = [...new Set(entry['days'].map((day: unknown) => DAYS.indexOf(String(day))))];
  const start = minutes(entry['startTime']);
  const end = minutes(entry['endTime']);
  const temperature = finite(entry['temperature']);
  if (
    days.length === 0 ||
    days.includes(-1) ||
    start === undefined ||
    end === undefined ||
    end <= start ||
    temperature === undefined
  ) {
    return undefined;
  }
  return { days: days.sort((a, b) => a - b), start, end, temperature };
}

function toHeater(entry: unknown): HeaterView {
  const heater = isRecord(entry) ? entry : {};
  const type = heater['type'];
  const list = heater['schedules'];
  const periods = Array.isArray(list) ? list.map(toPeriod) : undefined;
  return {
    kind: type === 'radiator' || type === 'floor' ? type : 'other',
    working: typeof heater['working'] === 'boolean' ? heater['working'] : undefined,
    reportedAt: text(heater['updatedAt']),
    callsForHeat: typeof heater['inSchedule'] === 'boolean' ? heater['inSchedule'] : undefined,
    periods: periods?.filter((period) => period !== undefined),
    unreadablePeriods: periods?.filter((period) => period === undefined).length ?? 0,
  };
}

/**
 * Reads the rooms out of the answer, in the order of the service. Nothing checks an answer at
 * runtime: an entry without a name is left out, and whatever is not what the service is
 * documented to send reads as "does not say" - a temperature that is not a number is "nothing
 * measured", a heater without `working` has no status, never "off".
 */
export function toRoomViews(answer: unknown): RoomView[] {
  if (!Array.isArray(answer)) {
    return [];
  }
  return answer.flatMap((entry: unknown): RoomView[] => {
    if (!isRecord(entry) || text(entry['name']) === undefined) {
      return [];
    }
    const reading = isRecord(entry['temperature']) ? entry['temperature'] : {};
    const temperature = finite(reading['value']);
    const list = entry['heaters'];
    const targets = Array.isArray(list)
      ? list.flatMap((heater: unknown) => {
          const scheduled = isRecord(heater) ? finite(heater['scheduledTemperature']) : undefined;
          return scheduled === undefined ? [] : [scheduled];
        })
      : [];
    return [
      {
        name: entry['name'] as string,
        temperature,
        // the time of a reading says nothing without the reading
        measuredAt: temperature === undefined ? undefined : text(reading['updatedAt']),
        // not Math.max(...targets): a list as long as the answer makes it must not be spread
        target: targets.reduce<number | undefined>(
          (highest, target) => (highest === undefined || target > highest ? target : highest),
          undefined,
        ),
        heaters: Array.isArray(list) ? list.map(toHeater) : undefined,
      },
    ];
  });
}

/** A part of the house with its rooms, as a section of the page. */
export interface FloorView {
  readonly id: string;
  readonly label: MessageKey;
  readonly rooms: readonly RoomView[];
}

/**
 * Which room lies where. The service knows rooms, not floors: this list is the one place that
 * does, by the identifiers of `RoomName` in `smart-home-sdk`. The order is the order on the
 * page, within a floor too.
 */
export const FLOORS: readonly { id: string; label: MessageKey; rooms: readonly string[] }[] = [
  {
    id: 'ground',
    label: 'heating.rooms.floor.ground',
    rooms: ['living room', 'cinema', 'bathroom down', 'entrance', 'garage'],
  },
  {
    id: 'upper',
    label: 'heating.rooms.floor.upper',
    rooms: ['office', 'tobi', 'livia', 'bedroom', 'wardrobe', 'bathroom up'],
  },
  { id: 'attic', label: 'heating.rooms.floor.attic', rooms: ['loft'] },
  { id: 'outside', label: 'heating.rooms.floor.outside', rooms: ['sauna', 'garden'] },
];

/**
 * The rooms by floor, in the order of `FLOORS`; a floor without a room in the answer is left
 * out. A room the list does not know - one added to the house since - is not dropped: it goes
 * into a last group of its own, in the order of the service.
 */
export function groupByFloor(rooms: readonly RoomView[]): FloorView[] {
  const placed = new Set<RoomView>();
  const floors = FLOORS.map(({ id, label, rooms: names }): FloorView => {
    const here = names.flatMap((name) => rooms.filter((room) => room.name === name));
    here.forEach((room) => placed.add(room));
    return { id, label, rooms: here };
  });
  const elsewhere = rooms.filter((room) => !placed.has(room));
  return [
    ...floors,
    { id: 'other', label: 'heating.rooms.floor.other' as const, rooms: elsewhere },
  ].filter((floor) => floor.rooms.length > 0);
}

/** One period of one day, placed on the day: where it starts and how long it is, in per cent. */
export interface DaySegment {
  readonly start: number;
  readonly end: number;
  readonly offset: number;
  readonly width: number;
  readonly temperature: number;
}

/** The seven days of a heater's week, Monday first, each with its periods in order. */
export function toWeek(periods: readonly SchedulePeriod[]): DaySegment[][] {
  const day = 24 * 60;
  return DAYS.map((_, index) =>
    periods
      .filter((period) => period.days.includes(index))
      .sort((a, b) => a.start - b.start)
      .map((period) => ({
        start: period.start,
        end: period.end,
        offset: (period.start / day) * 100,
        width: ((period.end - period.start) / day) * 100,
        temperature: period.temperature,
      })),
  );
}

/** Minutes since midnight as `07:00` - the same in every language. */
export function clockTime(minutesOfDay: number): string {
  const two = (value: number) => String(value).padStart(2, '0');
  return `${two(Math.floor(minutesOfDay / 60))}:${two(minutesOfDay % 60)}`;
}
