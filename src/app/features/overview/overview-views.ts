import { isRecord } from '../../core/util/is-record';
import { MessageKey } from '../../i18n/messages';
import { RoomView } from '../../shared/room-heating/room-views';

/** A room named with its temperature. */
export interface RoomReadingView {
  readonly name: string;
  readonly temperature: number;
}

/** What the tile of the rooms says: how many there are, how many are heated, the two extremes. */
export interface RoomsSummary {
  readonly total: number;
  /**
   * Rooms with a heater whose relay is on. `undefined` while no relay of the house has
   * answered: "0 heated" would be a claim, and right after a start of the service nobody knows.
   */
  readonly heating: number | undefined;
  /** `undefined` while no room has a reading - and the same room twice when only one has. */
  readonly coldest?: RoomReadingView;
  readonly warmest?: RoomReadingView;
}

export function summariseRooms(rooms: readonly RoomView[]): RoomsSummary {
  const heaters = rooms.flatMap((room) => room.heaters ?? []);
  const measured = rooms.flatMap((room): RoomReadingView[] =>
    room.temperature === undefined ? [] : [{ name: room.name, temperature: room.temperature }],
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
export function toPeople(answer: unknown): PersonView[] {
  if (!Array.isArray(answer)) {
    return [];
  }
  return answer.flatMap((entry: unknown): PersonView[] => {
    if (!isRecord(entry) || typeof entry['name'] !== 'string' || entry['name'] === '') {
      return [];
    }
    const present = entry['present'];
    const checked = typeof entry['lastCheckedAt'] === 'string' && entry['lastCheckedAt'] !== '';
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
      },
    ];
  });
}
