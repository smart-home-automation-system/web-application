import { houseInstant, parseHouseDateTime } from '../../core/time/house-date-time';
import { isRecord } from '../../core/util/is-record';
import { MessageKey } from '../../i18n/messages';
import { RoomView } from '../../shared/room-heating/room-views';

/** A room named with its temperature and the time of that reading. */
export interface RoomReadingView {
  readonly name: string;
  readonly temperature: number;
  /** House wall-clock time of the reading: the service keeps the last one of a silent sensor. */
  readonly measuredAt?: string;
}

/** What the tile of the rooms says: how many there are, how many are heated, the two extremes. */
export interface RoomsSummary {
  readonly total: number;
  /**
   * Rooms with a heater whose relay is on. `undefined` while no relay of the house has
   * answered: "0 heated" would be a claim, and right after a start of the service nobody knows.
   */
  readonly heating: number | undefined;
  /**
   * Of the rooms of the house: what stands outside it is counted and heated like any room, and
   * is not its coldest or warmest. `undefined` while no such room has a reading - and the same
   * room twice when only one has.
   */
  readonly coldest?: RoomReadingView;
  readonly warmest?: RoomReadingView;
}

export function summariseRooms(
  rooms: readonly RoomView[],
  outside: readonly string[] = [],
): RoomsSummary {
  const heaters = rooms.flatMap((room) => room.heaters ?? []);
  const measured = rooms.flatMap((room): RoomReadingView[] =>
    room.temperature === undefined || outside.includes(room.name)
      ? []
      : [{ name: room.name, temperature: room.temperature, measuredAt: room.measuredAt }],
  );
  const pick = (better: (a: number, b: number) => boolean) =>
    measured.reduce<RoomReadingView | undefined>(
      (best, room) =>
        best === undefined || better(room.temperature, best.temperature) ? room : best,
      undefined,
    );
  return {
    total: rooms.length,
    heating: heaters.some((heater) => heater.working !== undefined)
      ? rooms.filter((room) => (room.heaters ?? []).some((heater) => heater.working === true))
          .length
      : undefined,
    coldest: pick((a, b) => a < b),
    warmest: pick((a, b) => a > b),
  };
}

/** A member of the household and where the presence service last found them. */
export interface PersonView {
  /** The name of the registry, printed as it is. */
  readonly name: string;
  readonly state: 'home' | 'away' | 'not-observed' | 'unknown';
  /** House wall-clock time of the last pass of the detection that looked for them. */
  readonly lastCheckedAt?: string;
  /** The instant of that check, for its age. */
  readonly checkedAt?: number;
}

export const PERSON_STATE_LABELS: Readonly<Record<PersonView['state'], MessageKey>> = {
  home: 'presence.now.atHome',
  away: 'presence.now.away',
  'not-observed': 'presence.now.notObserved',
  unknown: 'presence.now.unknown',
};

/**
 * Reads who is at home out of the answer, in the order of the service - the rules of the
 * presence page: an entry without a name is left out, `present` that is not a flag is "no
 * status", and a member listed as not present with no check at all was never observed - which
 * is not "away".
 */
export function toPeople(answer: unknown, timeZone: string): PersonView[] {
  if (!Array.isArray(answer)) {
    return [];
  }
  return answer.flatMap((entry: unknown): PersonView[] => {
    if (!isRecord(entry) || typeof entry['name'] !== 'string' || entry['name'] === '') {
      return [];
    }
    const present = entry['present'];
    const lastCheckedAt =
      typeof entry['lastCheckedAt'] === 'string' && entry['lastCheckedAt'] !== ''
        ? entry['lastCheckedAt']
        : undefined;
    const checked = lastCheckedAt !== undefined;
    const parsed = parseHouseDateTime(lastCheckedAt);
    return [
      {
        name: entry['name'],
        state:
          typeof present !== 'boolean'
            ? 'unknown'
            : present
              ? 'home'
              : checked
                ? 'away'
                : 'not-observed',
        lastCheckedAt,
        checkedAt: parsed ? houseInstant(parsed, timeZone) : undefined,
      },
    ];
  });
}

/**
 * The most recent check among the members - the detection looks for all of them in one pass, so
 * this is when it last ran. `undefined` while nobody was ever checked.
 */
export function lastCheck(
  people: readonly PersonView[],
): { readonly lastCheckedAt: string; readonly checkedAt: number } | undefined {
  return people.reduce<{ lastCheckedAt: string; checkedAt: number } | undefined>(
    (latest, person) =>
      person.checkedAt !== undefined &&
      person.lastCheckedAt !== undefined &&
      (latest === undefined || person.checkedAt > latest.checkedAt)
        ? { lastCheckedAt: person.lastCheckedAt, checkedAt: person.checkedAt }
        : latest,
    undefined,
  );
}
