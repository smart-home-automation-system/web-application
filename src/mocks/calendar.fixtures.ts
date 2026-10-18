import { CalendarDay } from '../app/data-access/calendar/calendar-api';
import type { MockReply } from './handlers';

/**
 * The calendar of the house (`database-service`): every day of the range, a weekend and a holiday
 * a day off. The holidays here are those of a fixed date - the moving ones (Easter) are left out,
 * a mock needs no computus - and none of the household's own days is stored.
 */
const HOLIDAYS: Readonly<Record<string, string>> = {
  '01-01': "New Year's Day",
  '01-06': 'Epiphany',
  '05-01': 'Labour Day',
  '05-03': 'Constitution Day',
  '08-15': 'Assumption of Mary',
  '11-01': "All Saints' Day",
  '11-11': 'Independence Day',
  '12-24': 'Christmas Eve',
  '12-25': 'Christmas Day',
  '12-26': 'Second Day of Christmas',
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1_000;

function refusal(message: string): MockReply {
  return { status: 400, body: { errors: [{ message }] } };
}

/** The days from `from` to `to`, the end not included, refused as the service refuses a range. */
export function calendarDays(from: string | null, to: string | null): MockReply {
  if (!from || !to || !DATE.test(from) || !DATE.test(to)) {
    return refusal('from and to have to be dates');
  }
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!(start < end)) {
    return refusal(`The range has to start before it ends: from [${from}] to [${to}]`);
  }
  const days: CalendarDay[] = [];
  for (let at = start; at < end; at += DAY_MS) {
    const date = new Date(at).toISOString().slice(0, 10);
    const holiday = HOLIDAYS[date.slice(5)];
    const weekday = new Date(at).getUTCDay();
    days.push(
      holiday
        ? { date, type: 'day off', reason: holiday }
        : weekday === 6
          ? { date, type: 'day off', reason: 'Saturday' }
          : weekday === 0
            ? { date, type: 'day off', reason: 'Sunday' }
            : { date, type: 'workday' },
    );
  }
  return { status: 200, body: days };
}
