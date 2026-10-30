import { ApiError } from '../../core/api/api-error';
import {
  ApplianceChores,
  ChoresCount,
  MemberChores,
  MembersReport,
} from '../../data-access/appliance/appliance-api';
import { DisplayText, MessageKey } from '../../i18n/messages';
import { describeApplianceError } from './appliance-views';

/**
 * A cell of the chores report (HAS-346): what the service counted, each figure `undefined` when the answer
 * leaves it out - never read as 0. `share` is left out by the service without an opportunity.
 */
export interface ChoresCell {
  readonly opportunities?: number;
  readonly done?: number;
  readonly doneAway?: number;
  readonly share?: number;
}

export interface ChoresRow {
  /** The name as the registry spells it - printed as it is. */
  readonly member: string;
  /** A name met in the cycles that is no member any more. */
  readonly former: boolean;
  /** One per column, in the order of the columns; `undefined` where the member has no entry for it. */
  readonly cells: readonly (ChoresCell | undefined)[];
  readonly total?: ChoresCell;
}

export interface ChoresColumn {
  readonly id: number;
  /** The name of the registry; `undefined` for an appliance the service no longer watches. */
  readonly name?: string;
}

export interface ChoresTable {
  readonly columns: readonly ChoresColumn[];
  readonly rows: readonly ChoresRow[];
  /** The muted cycles of the period, all appliances together; `undefined` when not known. */
  readonly unattributed?: number;
  /** The cycles whose presence at the finish is not known - not counted as anybody's chance. */
  readonly unknownPresence?: number;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function cellOf(count: ChoresCount | undefined): ChoresCell | undefined {
  if (count === undefined || count === null) {
    return undefined;
  }
  return {
    opportunities: isNumber(count.opportunities) ? count.opportunities : undefined,
    done: isNumber(count.done) ? count.done : undefined,
    doneAway: isNumber(count.doneAway) ? count.doneAway : undefined,
    share: isNumber(count.share) ? count.share : undefined,
  };
}

function hasName(entry: MemberChores): entry is MemberChores & { member: string } {
  return typeof entry.member === 'string' && entry.member.length > 0;
}

/**
 * The report as a table: the members of the registry in its order, then the former members; a column per
 * appliance any entry names, in the order first met (the service lists every watched appliance for every
 * member). An entry without a name is left out; an appliance without an id is left out.
 */
export function toChoresTable(report: MembersReport | null | undefined): ChoresTable | undefined {
  if (report === undefined || report === null) {
    return undefined;
  }
  const members = (Array.isArray(report.members) ? report.members : []).filter(hasName);
  const former = (Array.isArray(report.former) ? report.former : []).filter(hasName);
  const columns: ChoresColumn[] = [];
  for (const entry of [...members, ...former]) {
    for (const appliance of entry.appliances ?? []) {
      if (
        isNumber(appliance.applianceId) &&
        !columns.some((column) => column.id === appliance.applianceId)
      ) {
        columns.push({ id: appliance.applianceId, name: appliance.name });
      }
    }
  }
  const row = (entry: MemberChores & { member: string }, isFormer: boolean): ChoresRow => ({
    member: entry.member,
    former: isFormer,
    cells: columns.map((column) =>
      cellOf(
        (entry.appliances ?? []).find(
          (appliance: ApplianceChores) => appliance.applianceId === column.id,
        ),
      ),
    ),
    total: cellOf(entry.total),
  });
  const unattributed = Array.isArray(report.unattributed)
    ? report.unattributed.reduce((sum, entry) => sum + (isNumber(entry.count) ? entry.count : 0), 0)
    : undefined;
  return {
    columns,
    rows: [
      ...members.map((entry) => row(entry, false)),
      ...former.map((entry) => row(entry, true)),
    ],
    unattributed,
    unknownPresence: isNumber(report.unknownPresence) ? report.unknownPresence : undefined,
  };
}

/**
 * The row of one member - the card of My room - found whatever the case of the name, as a personal link
 * finds a member; `undefined` when the report does not name them.
 */
export function choresOf(
  table: ChoresTable | undefined,
  member: string | undefined,
): ChoresRow | undefined {
  if (table === undefined || member === undefined) {
    return undefined;
  }
  const wanted = member.toLocaleLowerCase();
  return table.rows.find((row) => !row.former && row.member.toLocaleLowerCase() === wanted);
}

/** The share as a whole percentage (0.833 is 83); `undefined` without one. */
export function sharePercent(cell: ChoresCell | undefined): number | undefined {
  return cell?.share === undefined ? undefined : Math.round(cell.share * 100);
}

/**
 * The refusals of the report (`ApplianceError`): `INVALID_RANGE` - the page asks for whole months, so it
 * means a version that asks for what the service does not take; the rest as the other appliance calls.
 */
export const CHORES_ERROR_TEXTS: Readonly<Record<string, MessageKey>> = {
  INVALID_RANGE: 'chores.error.invalidRange',
};

export function describeChoresError(error: ApiError): DisplayText {
  const named = Object.entries(CHORES_ERROR_TEXTS).find(([code]) => error.hasCode(code));
  return named ? { key: named[1] } : describeApplianceError(error);
}
