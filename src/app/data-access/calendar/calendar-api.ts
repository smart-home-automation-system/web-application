import { Injectable, inject } from '@angular/core';

import { ApiClient } from '../../core/api/api-client';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';
import { APP_CONFIG } from '../../core/config/app-config';
import { houseDay } from '../../core/time/house-date-time';
import { isRecord } from '../../core/util/is-record';

/**
 * One day of `GET /home/calendar/days` (`database-service` 0.14.0, `CalendarDay` of
 * `smart-home-sdk`): a `workday` or a `day off`, with the reason of a day off - the household's
 * words, the name of the holiday, or the day of the week. **Read `type`, never `reason`**: the
 * reason is text for people.
 */
export interface CalendarDay {
  /** `2026-11-11`. */
  readonly date?: string;
  readonly type?: string;
  readonly reason?: string;
}

/** A day off of the working week: what the schedules of the blinds treat as a holiday. */
export interface Holiday {
  readonly date: string;
  readonly reason?: string;
}

const DAY_MS = 24 * 60 * 60 * 1_000;

// the calendar changes when a law does, or when the household adds a day - and at midnight
const POLL_EVERY_MS = 15 * 60_000;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The calendar of the house (HAS-252), read only: the statutory holidays are computed by
 * `database-service`, and a day off is nothing else for the dashboard (owner, 2026-10-18).
 */
@Injectable({ providedIn: 'root' })
export class CalendarApi {
  private readonly api = inject(ApiClient);
  private readonly timeZone = inject(APP_CONFIG).houseTimeZone;

  /**
   * The days from today of the house on, `days` of them. The range is worked out at every call,
   * so it moves on at midnight by itself; the answer names its dates, so nothing on screen can
   * stand under another day.
   */
  watchDays(days: number): PollingResource<readonly CalendarDay[] | null> {
    return pollingResource(
      () => {
        const today = houseDay(Date.now(), this.timeZone);
        const to = new Date(Date.parse(`${today}T00:00:00Z`) + days * DAY_MS)
          .toISOString()
          .slice(0, 10);
        return this.api.get<readonly CalendarDay[] | null>('/calendar/days', { from: today, to });
      },
      { intervalMs: POLL_EVERY_MS },
    );
  }
}

/**
 * The days off from Monday to Friday, in the order of the calendar: the holidays. A weekend is a
 * day off every week and says nothing; a day without a readable date is passed over.
 */
export function holidaysOf(days: unknown): readonly Holiday[] | undefined {
  if (!Array.isArray(days)) {
    return undefined;
  }
  return (days as unknown[])
    .filter(isRecord)
    .filter((day) => day['type'] === 'day off')
    .flatMap((day): Holiday[] => {
      const date = day['date'];
      if (typeof date !== 'string' || !DATE.test(date)) {
        return [];
      }
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      if (Number.isNaN(weekday) || weekday === 0 || weekday === 6) {
        return [];
      }
      const reason = day['reason'];
      return [{ date, ...(typeof reason === 'string' ? { reason } : {}) }];
    });
}
