import { isRecord } from '../../core/util/is-record';

/** A temperature sensor as the table shows it. */
export interface SensorRow {
  /** The identifier of the room in the backend, printed as it is. */
  readonly room: string;
  /** House wall-clock time of the last reading. */
  readonly lastReadingAt?: string;
  /** Silent for too long; `undefined` when the answer does not say. */
  readonly stale: boolean | undefined;
  /** Left out of the alerts. */
  readonly muted: boolean;
}

/**
 * Reads the sensors out of the answer, the silent ones first - they are what the table is looked
 * at for - and otherwise in the order of the service. Nothing checks an answer at runtime: an
 * entry without a room is left out, and a sensor whose `stale` is not a flag is neither
 * "reporting" nor "silent".
 */
export function toSensorRows(answer: unknown): SensorRow[] {
  if (!Array.isArray(answer)) {
    return [];
  }
  const rows = answer.flatMap((entry: unknown): SensorRow[] => {
    if (!isRecord(entry) || typeof entry['room'] !== 'string' || entry['room'] === '') {
      return [];
    }
    const at = entry['lastReadingAt'];
    return [
      {
        room: entry['room'],
        lastReadingAt: typeof at === 'string' ? at : undefined,
        stale: typeof entry['stale'] === 'boolean' ? entry['stale'] : undefined,
        muted: entry['muted'] === true,
      },
    ];
  });
  // a stable sort: within each group the order of the service stays
  return rows.sort((a, b) => rank(a) - rank(b));
}

/** A silent sensor somebody should look at, then one known to be retired, then the rest. */
function rank(row: SensorRow): number {
  if (row.stale !== true) {
    return 2;
  }
  return row.muted ? 1 : 0;
}

/** What the line above the table says: how many sensors there are and how many are silent. */
export interface SensorSummary {
  readonly total: number;
  readonly silent: number;
  /** True when every sensor is known to report - not merely when none is known to be silent. */
  readonly allReporting: boolean;
}

export function summarise(rows: readonly SensorRow[]): SensorSummary {
  return {
    total: rows.length,
    silent: rows.filter((row) => row.stale === true).length,
    allReporting: rows.length > 0 && rows.every((row) => row.stale === false),
  };
}
