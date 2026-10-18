import { ApiError } from '../../core/api/api-error';

/**
 * The schedules of the blinds as `blinds-service` 0.8.0 answers them (`GET /home/blinds/schedules`,
 * `.../{id}/today`). Every field is optional: the service leaves out what it does not know, and
 * nothing here checks an answer at runtime. The values are its words (`day off`, `window
 * closed`) - a value this version does not know is printed as it came.
 */

/** An end of the window: a `clock` time, or the `sunrise` / `sunset` moved and held between two times. */
export interface WindowEnd {
  readonly kind?: string;
  /** `HH:mm`, local time of the house. */
  readonly time?: string;
  readonly offsetMinutes?: number;
  readonly earliest?: string;
  readonly latest?: string;
}

/** What a schedule moves: every blind of a room, or one blind by its id in the device registry. */
export interface ScheduleTarget {
  readonly room?: string;
  readonly deviceId?: number;
}

/** What has to hold: a metric `lt` / `gt` a threshold, or `is` a truth, for `holdMinutes`. */
export interface ScheduleCondition {
  readonly metric?: string;
  readonly operator?: string;
  readonly threshold?: number;
  readonly value?: boolean;
  readonly holdMinutes?: number;
}

/** A schedule as stored. */
export interface BlindSchedule {
  readonly id?: number;
  readonly name?: string;
  readonly enabled?: boolean;
  /** `workday`, `day off` or `any`. */
  readonly dayType?: string;
  readonly window?: { readonly from?: WindowEnd; readonly to?: WindowEnd };
  readonly targets?: readonly ScheduleTarget[];
  readonly conditions?: readonly ScheduleCondition[];
  /** `open`, `close` or `position`. */
  readonly action?: string;
  /** 0 closed ... 100 open; the action `position` only. */
  readonly position?: number;
}

/** A condition today: the value it was judged by and whether it holds. */
export interface TodayCondition extends ScheduleCondition {
  /** A number, or a truth for `raining`; left out without a recent value. */
  readonly current?: number | boolean;
  readonly measuredAt?: string;
  readonly trueSince?: string;
  /** `met`, `holding`, `not met`, `unknown`, or `per blind` for `window closed`. */
  readonly state?: string;
}

/** A blind of the targets today; one the registry no longer knows comes without a name and a room. */
export interface TodayTarget {
  readonly deviceId?: number;
  readonly name?: string;
  readonly room?: string;
  /** Its window: `closed`, `open`, `no sensor`, `unknown`. */
  readonly window?: string;
  /** Its `window closed` conditions together; left out for a schedule without one. */
  readonly windowClosed?: string;
  readonly firedAt?: string;
  /** `moved`, `failed`, `unsupported`, `paused`. */
  readonly outcome?: string;
}

/** What the engine makes of a schedule on the day its window opened on. */
export interface ScheduleToday {
  readonly scheduleId?: number;
  /** The day the window opened on, `2026-10-18` - yesterday while a night window still lasts. */
  readonly date?: string;
  readonly dayType?: string;
  /** False when the calendar could not be read and the weekday decided. */
  readonly dayTypeFromCalendar?: boolean;
  readonly runsToday?: boolean;
  /** Left out when an end is a time of the sun the day does not have. */
  readonly window?: { readonly from?: string; readonly to?: string; readonly nextDay?: boolean };
  readonly conditions?: readonly TodayCondition[];
  readonly targets?: readonly TodayTarget[];
  /** `fires`, `waiting for the conditions`, `fired today`, `before the window` ... */
  readonly decision?: string;
}

/** A schedule with its day; `today` missing when the service did not answer for it. */
export interface ScheduleEntry {
  readonly schedule: BlindSchedule;
  readonly today?: ScheduleToday;
  /** Why the day of this schedule is not known, when its call failed. */
  readonly todayError?: ApiError;
}
