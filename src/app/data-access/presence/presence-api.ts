import { Injectable, effect, inject, untracked } from '@angular/core';
import { Observable, forkJoin, map, of } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';

/**
 * One entry of `GET /home/presence/residents/presence` (`presence-service`): an active member of
 * the household and whether they are at home. A member nothing is stored for yet is listed as
 * not present, with both times `null`.
 */
export interface ResidentPresence {
  /** The name of the registry - the key the reports are asked by. */
  readonly name?: string;
  readonly present?: boolean;
  /** House wall-clock time the current status began. */
  readonly since?: string | null;
  /** House wall-clock time of the last pass that confirmed it: how fresh the answer is. */
  readonly lastCheckedAt?: string | null;
}

/** A period at home, cut to the range that was asked for. */
export interface PresenceInterval {
  readonly from?: string;
  readonly to?: string;
  /** The last period of the history, which nothing closed: its end is the last check. */
  readonly open?: boolean;
}

/** `GET /home/presence/residents/{name}/report`: when one resident was at home. */
export interface PresenceReport {
  readonly name?: string;
  readonly from?: string;
  readonly to?: string;
  readonly intervals?: readonly PresenceInterval[];
}

export interface DailyPresence {
  /** A calendar day of the house, `2026-10-05`. */
  readonly date?: string;
  readonly secondsAtHome?: number;
  /** `null` on a day spent entirely at home, or entirely away. */
  readonly firstArrival?: string | null;
  readonly lastDeparture?: string | null;
  /** Of the part of the day that was observed. */
  readonly presencePercentage?: number;
}

/**
 * `GET /home/presence/residents/{name}/report/daily`. `observedFrom` and `observedUntil` bound
 * the part of the range the history covers; both are `null`, with no days, when nothing was
 * observed inside the range.
 */
export interface DailyPresenceReport {
  readonly name?: string;
  readonly from?: string;
  readonly to?: string;
  readonly observedFrom?: string | null;
  readonly observedUntil?: string | null;
  readonly days?: readonly DailyPresence[];
}

export interface OccupancyInterval {
  readonly from?: string;
  readonly to?: string;
  readonly occupied?: boolean;
}

export interface DailyOccupancy {
  readonly date?: string;
  readonly secondsOccupied?: number;
  readonly secondsEmpty?: number;
  readonly wasEmpty?: boolean;
}

/**
 * `GET /home/presence/house/report`: the house as one timeline of occupied and empty stretches,
 * from `observedFrom` to `observedUntil`. Time the service did not watch *in the middle* of its
 * history reads as empty there - the service does not know better, and neither does this
 * application.
 */
export interface HouseReport {
  readonly from?: string;
  readonly to?: string;
  readonly observedFrom?: string | null;
  readonly observedUntil?: string | null;
  readonly intervals?: readonly OccupancyInterval[];
  readonly days?: readonly DailyOccupancy[];
}

/**
 * The range of a report: local date-times of the house without an offset
 * (`2026-10-01T00:00:00`), the start included and the end not. At most 366 days.
 */
export interface ReportRange {
  readonly from: string;
  readonly to: string;
}

/** Whose history, and of which range. */
export interface ResidentQuery {
  readonly name: string;
  readonly range: ReportRange;
}

/** Both reports of one resident for one range: the periods at home and the days. */
export interface ResidentHistory {
  readonly report: PresenceReport | null;
  readonly daily: DailyPresenceReport | null;
}

/**
 * An answer together with the question it answers. A report is asked for a range somebody can
 * change, and the answer for the old range stays on screen until the new one arrives: the view
 * compares `query` with what it shows the controls for.
 */
export interface Answered<Q, T> {
  readonly query: Q;
  readonly answer: T;
}

// the engine of presence-service looks at the network once a minute
const POLL_NOW_EVERY_MS = 60_000;
// a report changes only at its running end, and a long one is a large answer
const POLL_REPORT_EVERY_MS = 5 * 60_000;

@Injectable({ providedIn: 'root' })
export class PresenceApi {
  private readonly api = inject(ApiClient);

  /** Who is at home now. Call in an injection context: the polling lives as long as the caller. */
  watchNow(): PollingResource<readonly ResidentPresence[] | null> {
    return pollingResource(
      () => this.api.get<readonly ResidentPresence[] | null>('/presence/residents/presence'),
      { intervalMs: POLL_NOW_EVERY_MS },
    );
  }

  /**
   * The occupancy of the house for the range `range()` gives - asked again whenever that changes.
   * Call in an injection context: the polling lives as long as the caller.
   */
  watchHouse(range: () => ReportRange): PollingResource<Answered<ReportRange, HouseReport | null>> {
    return this.watch(range, (asked) =>
      this.api.get<HouseReport | null>('/presence/house/report', { ...asked }),
    );
  }

  /**
   * The periods at home and the days of the resident `query()` names - asked again whenever the
   * resident or the range changes; `null` while there is nobody to ask about. Two calls, one
   * resource: they are shown together, and either failing leaves nothing to show. Call in an
   * injection context: the polling lives as long as the caller.
   */
  watchResident(
    query: () => ResidentQuery | undefined,
  ): PollingResource<Answered<ResidentQuery | undefined, ResidentHistory | null>> {
    return this.watch(query, (asked) => {
      if (asked === undefined) {
        return of(null);
      }
      // the name is a path segment: a space or a slash in it must not change the path
      const path = `/presence/residents/${encodeURIComponent(asked.name)}/report`;
      return forkJoin({
        report: this.api.get<PresenceReport | null>(path, { ...asked.range }),
        daily: this.api.get<DailyPresenceReport | null>(`${path}/daily`, { ...asked.range }),
      });
    });
  }

  private watch<Q, T>(
    query: () => Q,
    load: (asked: Q) => Observable<T>,
  ): PollingResource<Answered<Q, T>> {
    const resource = pollingResource(
      () => {
        // read when the call is made: the answer is tagged with exactly what was asked
        const asked = untracked(query);
        return load(asked).pipe(map((answer) => ({ query: asked, answer })));
      },
      { intervalMs: POLL_REPORT_EVERY_MS },
    );
    // a new question is asked at once; the answer to the old one, still on its way, is dropped
    let first = true;
    effect(() => {
      query();
      if (first) {
        // the resource makes its first call by itself
        first = false;
        return;
      }
      void resource.refresh();
    });
    return resource;
  }
}
