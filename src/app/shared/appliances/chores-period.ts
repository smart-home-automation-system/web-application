import { houseDay } from '../../core/time/house-date-time';
import { HistoryRange } from '../../core/time/history-range';
import { MessageKey } from '../../i18n/messages';

/** The periods of the chores report (HAS-346): calendar months of the house. */
export type ChoresPeriod = 'thisMonth' | 'lastMonth' | 'threeMonths';

export const CHORES_PERIODS: readonly ChoresPeriod[] = ['thisMonth', 'lastMonth', 'threeMonths'];

export const CHORES_PERIOD_LABELS: Readonly<Record<ChoresPeriod, MessageKey>> = {
  thisMonth: 'chores.period.thisMonth',
  lastMonth: 'chores.period.lastMonth',
  threeMonths: 'chores.period.threeMonths',
};

/** The first day of a month `offset` months from the one given, as the start of a local date-time. */
function monthStart(year: number, month: number, offset: number): string {
  const first = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${first.toISOString().slice(0, 10)}T00:00:00`;
}

/**
 * The range of a period in calendar months of the house, the start included and the end not: this month,
 * the one before it, and the last three months with this one - always whole months, so the numbers of a
 * month do not move with the day it is looked at, and the end of this month lies in the future, where there
 * are simply no cycles.
 */
export function choresRange(period: ChoresPeriod, instant: number, timeZone: string): HistoryRange {
  const [year, month] = houseDay(instant, timeZone).split('-').map(Number);
  switch (period) {
    case 'thisMonth':
      return { from: monthStart(year, month, 0), to: monthStart(year, month, 1) };
    case 'lastMonth':
      return { from: monthStart(year, month, -1), to: monthStart(year, month, 0) };
    case 'threeMonths':
      return { from: monthStart(year, month, -2), to: monthStart(year, month, 1) };
  }
}
