import { Injectable, Signal, inject, signal } from '@angular/core';
import { Observable, catchError, concatMap, from, map, of, toArray } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';
import { ApiError, toApiError } from '../../core/api/api-error';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';
import { QueryResource, queryResource } from '../../core/api/query-resource';
import { HistoryRange } from '../../core/time/history-range';

/**
 * One appliance of `GET /home/appliance` (`appliance-service` 0.3.0, HAS-278): a washing machine, a
 * dryer or a dishwasher watched through the draw of its plug. **A field the answer leaves out is not
 * known** - the service leaves out what it has not seen since its start (`watts` before the first
 * valid reading, `reachable` before the first poll) and what the state has not (`runningSince`
 * outside a cycle). The times are house wall-clock times.
 */
export interface Appliance {
  /** The id of the plug in the device registry. */
  readonly id?: number;
  /** The name of the registry, printed as it is - never a translation. */
  readonly name?: string;
  readonly room?: string;
  /** `idle`, `running`, `finishing` (the draw fell; a pause or the end) or `finished` (waits to be emptied). */
  readonly state?: string;
  readonly watts?: number;
  /** The time of that reading. */
  readonly sampledAt?: string;
  /** The start of the cycle - `running` and `finishing` only. */
  readonly runningSince?: string;
  /** The end of the cycle (the draw fell for good) - `finished` only. */
  readonly finishedAt?: string;
  /** Since when the finished cycle waits to be acknowledged - `finished` only. */
  readonly awaitingSince?: string;
  /** Whether the last poll of the plug was answered. */
  readonly reachable?: boolean;
}

/** One cycle of `GET /home/appliance/{id}/runs`: a running one has no end yet. */
export interface ApplianceRun {
  readonly id?: number;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly energyWh?: number;
  readonly maxWatts?: number;
  readonly acknowledgedAt?: string;
  /** Who acknowledged it in the application (HAS-347) - left out when nobody was named. */
  readonly acknowledgedBy?: string;
}

/** One sample of `GET /home/appliance/{id}/samples`: the draw of the plug, every 30 s. */
export interface ApplianceSample {
  readonly at?: string;
  readonly watts?: number;
}

/**
 * The cycles of one appliance in a range (HAS-283), as one entry of the history of every appliance: the
 * runs it answered, or the failure of its own call - the others are told all the same. `runs` is
 * `undefined` when the call failed, and also when the service answered without a list.
 */
export interface RunsOf {
  readonly id: number;
  readonly runs?: readonly ApplianceRun[];
  readonly error?: ApiError;
}

/** What the history of every appliance is asked for: which appliances, over which range. */
export interface RunsQuery {
  readonly ids: readonly number[];
  readonly range: HistoryRange;
}

/**
 * What the NFC tag of an appliance put into its URL (HAS-343, HAS-346): `picc_data` (the UID and the
 * read counter, encrypted, 32 hex characters) and `cmac` (16). Each read is good for one claim.
 */
export interface TagRead {
  readonly piccData: string;
  readonly cmac: string;
}

/**
 * The answer of `POST /home/appliance/claims` (`appliance-service` >= 0.7.0): the appliance of the tag,
 * its state after the claim, the member as the registry spells them and the cycle the claim attached to.
 * A field the answer leaves out is not known.
 */
export interface ClaimReply {
  readonly applianceId?: number;
  /** The name of the registry, printed as it is - never a translation. */
  readonly name?: string;
  readonly state?: string;
  readonly member?: string;
  readonly runId?: number;
  /** A house wall-clock time. */
  readonly claimedAt?: string;
}

/**
 * A count of the chores report (`appliance-service` >= 0.9.0, HAS-345): `opportunities` - the cycles that
 * finished while the member was at home; `done` - the cycles attributed to them while at home at the
 * completion or not known, a shared one counting half; `doneAway` - attributed while known to be away;
 * `share` - done / opportunities, left out without an opportunity (it may pass 1).
 */
export interface ChoresCount {
  readonly opportunities?: number;
  readonly done?: number;
  readonly doneAway?: number;
  readonly share?: number;
}

/** One appliance of a member: its name is the registry's, left out for one no longer watched. */
export interface ApplianceChores extends ChoresCount {
  readonly applianceId?: number;
  readonly name?: string;
}

export interface MemberChores {
  /** The name as the registry spells it - text from outside, printed as it is. */
  readonly member?: string;
  readonly appliances?: readonly ApplianceChores[];
  readonly total?: ChoresCount;
}

/**
 * `GET /home/appliance/reports/members?from=&to=` (HAS-345): every member of the registry, the names no
 * longer members (`former`), the muted cycles per appliance and the cycles whose presence is not known.
 */
export interface MembersReport {
  readonly from?: string;
  readonly to?: string;
  readonly members?: readonly MemberChores[];
  readonly former?: readonly MemberChores[];
  readonly unattributed?: readonly { readonly applianceId?: number; readonly name?: string; readonly count?: number }[];
  readonly unknownPresence?: number;
}

/** An acknowledgement the service did not carry out. */
export interface FailedAcknowledgement {
  /** The appliance it was for. */
  readonly id: number;
  readonly error: ApiError;
}

/**
 * The appliances, kept fresh by polling, and the way to acknowledge a finished one - the pattern of
 * the heating switch: no optimistic state, the list is read again after the acknowledgement, carried
 * out or not, and only that answer moves the screen.
 */
export interface AppliancesControl extends PollingResource<readonly Appliance[] | null> {
  /** The appliance whose acknowledgement is on its way, until the list has been read again. */
  readonly acknowledging: Signal<number | undefined>;
  /** The last acknowledgement, if it failed; cleared by the next one. */
  readonly acknowledgeFailure: Signal<FailedAcknowledgement | undefined>;
  /**
   * `POST /home/appliance/{id}/acknowledge`, with the member of the profile in use when there is one
   * (HAS-347: the household messages name who acknowledged it). Ignored while another is on its way.
   */
  acknowledge(id: number, member?: string): void;
}

// what runs and what has finished: the notice of the shell reads it on every page
const POLL_EVERY_MS = 30_000;
// the history of a cycle moves with a sample every 30 s; the chart is a look back
const POLL_HISTORY_EVERY_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class ApplianceApi {
  private readonly api = inject(ApiClient);

  /**
   * Every appliance with the way to acknowledge a finished one. Call in an injection context: the
   * polling lives as long as the caller - `ApplianceStore` holds the one of the application. An
   * acknowledgement on its way is not aborted with the caller (a write cut off halfway is carried
   * out or not, and nobody would know which).
   */
  watchAppliances(): AppliancesControl {
    const appliances = pollingResource(
      () => this.api.get<readonly Appliance[] | null>('/appliance'),
      { intervalMs: POLL_EVERY_MS },
    );
    const acknowledging = signal<number | undefined>(undefined);
    const acknowledgeFailure = signal<FailedAcknowledgement | undefined>(undefined);

    // the answer of the write is not used: what the screen shows is the list the service gives
    // when asked, also after an acknowledgement that failed or got no answer
    const readAgain = () => void appliances.refresh().then(() => acknowledging.set(undefined));

    return {
      ...appliances,
      acknowledging: acknowledging.asReadonly(),
      acknowledgeFailure: acknowledgeFailure.asReadonly(),
      acknowledge: (id, member) => {
        if (acknowledging() !== undefined) {
          return;
        }
        acknowledging.set(id);
        acknowledgeFailure.set(undefined);
        const params = member === undefined ? undefined : { member };
        this.api.post<unknown>(`/appliance/${id}/acknowledge`, undefined, params).subscribe({
          error: (failure: unknown) => {
            acknowledgeFailure.set({ id, error: toApiError(failure) });
            readAgain();
          },
          complete: readAgain,
        });
      },
    };
  }

  /**
   * `POST /home/appliance/claims` (HAS-343): the chore of the appliance a tag is on, claimed by a member.
   * One call, never repeated by itself - a read is spent once the service took its counter, so a second
   * attempt of the same read answers `REPLAYED_TAG`. The service checks the member against the
   * household profiles (`UNKNOWN_MEMBER`).
   */
  claim(read: TagRead, member: string): Observable<ClaimReply | null> {
    return this.api.post<ClaimReply | null>('/appliance/claims', { ...read, member });
  }

  /**
   * The chores report of a range of the house (HAS-345, at most 366 days), tagged with the range it answers -
   * the period on screen can change while a call is on its way. Call in an injection context.
   */
  watchMembersReport(range: () => HistoryRange): QueryResource<HistoryRange, MembersReport | null> {
    return queryResource(
      range,
      (asked) => this.api.get<MembersReport | null>('/appliance/reports/members', { ...asked }),
      { intervalMs: POLL_HISTORY_EVERY_MS },
    );
  }

  /**
   * The cycles of every appliance in one range (HAS-283, the appliances page): `GET /appliance/{id}/runs`
   * of each, one after the other, as **one resource** - the counters of the whole house and of each
   * appliance read the same answer. A call that fails is the `error` of its appliance, never the end of
   * the others. Asked again at once when the appliances or the range change. Call in an injection
   * context.
   */
  watchRunsOf(query: () => RunsQuery): QueryResource<RunsQuery, readonly RunsOf[]> {
    return queryResource(
      query,
      (asked) =>
        from(asked.ids).pipe(
          concatMap((id) => this.runsOf(id, asked.range)),
          toArray(),
        ),
      { intervalMs: POLL_HISTORY_EVERY_MS },
    );
  }

  /**
   * The samples of one appliance in a range of the house (at most 2 days) - the chart of the appliances
   * page, tagged with the range it answers (HAS-283). The id is read when a call is made - an input of the
   * card, set before the first call; the card is made anew for another appliance. Call in an injection
   * context.
   */
  watchSampleHistory(
    id: () => number,
    range: () => HistoryRange,
  ): QueryResource<HistoryRange, readonly ApplianceSample[] | null> {
    return queryResource(
      range,
      (asked) =>
        this.api.get<readonly ApplianceSample[] | null>(`/appliance/${id()}/samples`, { ...asked }),
      { intervalMs: POLL_HISTORY_EVERY_MS },
    );
  }

  private runsOf(id: number, range: HistoryRange): Observable<RunsOf> {
    return this.api.get<readonly ApplianceRun[] | null>(`/appliance/${id}/runs`, { ...range }).pipe(
      map((runs): RunsOf => ({ id, runs: Array.isArray(runs) ? runs : undefined })),
      catchError((failure: unknown) => of<RunsOf>({ id, error: toApiError(failure) })),
    );
  }

  /**
   * The cycles of one appliance that started in a range of the house (at most 31 days). The range
   * is read when a call is made; the resource is for one appliance - its caller is made anew for
   * another. Call in an injection context.
   */
  watchRuns(
    id: number,
    range: () => HistoryRange,
  ): PollingResource<readonly ApplianceRun[] | null> {
    return pollingResource(
      () => this.api.get<readonly ApplianceRun[] | null>(`/appliance/${id}/runs`, { ...range() }),
      { intervalMs: POLL_HISTORY_EVERY_MS },
    );
  }

  /** The samples of one appliance in a range of the house (at most 2 days) - the chart of HAS-283. */
  watchSamples(
    id: number,
    range: () => HistoryRange,
  ): PollingResource<readonly ApplianceSample[] | null> {
    return pollingResource(
      () =>
        this.api.get<readonly ApplianceSample[] | null>(`/appliance/${id}/samples`, { ...range() }),
      { intervalMs: POLL_HISTORY_EVERY_MS },
    );
  }
}
