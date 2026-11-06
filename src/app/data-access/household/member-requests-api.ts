import { Injectable, Signal, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, concatMap, from, of, reduce } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';
import { ApiError, toApiError } from '../../core/api/api-error';
import { QueryResource, queryResource } from '../../core/api/query-resource';

/** How often the list of a member is read again. */
const POLL_EVERY_MS = 60_000;

/**
 * `MemberRequest` of `smart-home-sdk` 1.17.0 as `database-service` >= 0.22.0 answers it (HAS-409): an
 * errand one member wrote for another, texted to its recipient once, the next morning at 08:00
 * (notification-service 0.9.0). The times are wall-clock texts of the house; what the server has not set
 * is left out - `sentAt` until the SMS went, `doneAt` / `doneBy` while it is open.
 */
export interface MemberRequest {
  readonly id: number;
  readonly member?: string;
  readonly text: string;
  readonly author?: string;
  readonly createdAt?: string;
  readonly sentAt?: string;
  readonly doneAt?: string;
  readonly doneBy?: string;
}

/** What a change was, for the failure told next to it. */
export type RequestChange =
  | { readonly kind: 'add'; readonly recipient: string }
  | { readonly kind: 'done' | 'remove'; readonly id: number };

export interface FailedRequestChange {
  readonly change: RequestChange;
  readonly error: ApiError;
}

/**
 * The requests of one member, open and done in the last 30 days, polled - plus the three writes. Nothing
 * optimistic: after a write the list is read again and only that answer moves the screen. One write at a
 * time; a press while one is on its way is ignored.
 */
export interface MemberRequestsControl extends QueryResource<
  string | undefined,
  readonly MemberRequest[] | null
> {
  /** The change on its way, `undefined` when none is. */
  readonly changing: Signal<RequestChange | undefined>;
  /** The last change that failed; cleared by the next one. */
  readonly failure: Signal<FailedRequestChange | undefined>;
  /** The recipient of the last request added - for "added for ..." while nothing else changed. */
  readonly added: Signal<string | undefined>;
  /** `author` is the member of the profile; resolves true once the service took it. */
  add(recipient: string, text: string, author: string): Promise<boolean>;
  /** Ticked off by `by`, the member of the profile. */
  done(id: number, by: string): void;
  remove(id: number): void;
}

/** A removal of a request written for another member that failed. */
export interface FailedWrittenRemoval {
  readonly id: number;
  readonly error: ApiError;
}

/**
 * What the member of the profile wrote for the others of the household (HAS-411): the lists of those
 * members read together, each request as the service answers it - `member` is its recipient. Only
 * removal is offered: ticking off is the recipient's.
 */
export interface WrittenRequestsControl extends QueryResource<
  string | undefined,
  readonly MemberRequest[] | null
> {
  /** The question asked now - the answer and the error on screen are those of this one only. */
  readonly asked: Signal<string | undefined>;
  /** The id whose removal is on its way. */
  readonly removing: Signal<number | undefined>;
  readonly failure: Signal<FailedWrittenRemoval | undefined>;
  remove(recipient: string, id: number): void;
}

/**
 * The household requests of `database-service` >= 0.22.0 (HAS-409, epic HAS-407), on endpoints of their
 * own below the routed `/household` - never a field of a member. Older services answer the bare 404 of a
 * path nobody serves, which the card shows and the rest of the page never notices.
 */
@Injectable({ providedIn: 'root' })
export class MemberRequestsApi {
  private readonly api = inject(ApiClient);

  /**
   * The list of `member()` - `GET .../requests?done=true`, the open ones and those done in the last 30
   * days in one answer, oldest first. No call while there is no member. Call in an injection context.
   */
  watch(member: () => string | undefined): MemberRequestsControl {
    const requests = queryResource(
      member,
      (asked): Observable<readonly MemberRequest[] | null> =>
        asked === undefined
          ? of(null)
          : this.api.get<readonly MemberRequest[] | null>(`${pathOf(asked)}/requests`, {
              done: 'true',
            }),
      { intervalMs: POLL_EVERY_MS },
    );
    const changing = signal<RequestChange | undefined>(undefined);
    const failure = signal<FailedRequestChange | undefined>(undefined);
    const added = signal<string | undefined>(undefined);
    // what was added, and what failed, was for the list of the member it was written from
    effect(() => {
      member();
      untracked(() => {
        added.set(undefined);
        failure.set(undefined);
      });
    });

    // the answer of a write is never used: the screen shows what the service gives when asked again,
    // also after a write that failed or got no answer
    const run = (change: RequestChange, write: Observable<unknown>): Promise<boolean> => {
      if (changing() !== undefined) {
        return Promise.resolve(false);
      }
      changing.set(change);
      failure.set(undefined);
      added.set(undefined);
      return new Promise<boolean>((resolve) => {
        const readAgain = (taken: boolean) =>
          void requests.refresh().then(() => {
            changing.set(undefined);
            resolve(taken);
          });
        write.subscribe({
          error: (failed: unknown) => {
            failure.set({ change, error: toApiError(failed) });
            readAgain(false);
          },
          complete: () => {
            if (change.kind === 'add') {
              added.set(change.recipient);
            }
            readAgain(true);
          },
        });
      });
    };

    return {
      ...requests,
      changing: changing.asReadonly(),
      failure: failure.asReadonly(),
      added: added.asReadonly(),
      add: (recipient, text, author) =>
        run(
          { kind: 'add', recipient },
          this.api.post<unknown>(`${pathOf(recipient)}/requests`, { text, author }),
        ),
      done: (id, by) => {
        const owner = untracked(member);
        if (owner !== undefined) {
          void run(
            { kind: 'done', id },
            this.api.put<unknown>(`${pathOf(owner)}/requests/${id}/done`, undefined, {
              member: by,
            }),
          );
        }
      },
      remove: (id) => {
        const owner = untracked(member);
        if (owner !== undefined) {
          void run(
            { kind: 'remove', id },
            this.api.delete<unknown>(`${pathOf(owner)}/requests/${id}`),
          );
        }
      },
    };
  }

  /**
   * The lists of `recipients()` - `GET .../requests?done=true` of each, one after the other - as one
   * answer; the caller picks what `author` wrote. The service has no read by author: its read of the
   * whole household (`?pending=true`) holds only what is not texted yet. A list that fails fails the
   * whole answer - half of what was written is no answer to "what did I write". No call while there is
   * no author or nobody to write for.
   */
  watchWrittenBy(
    author: () => string | undefined,
    recipients: () => readonly string[],
  ): WrittenRequestsControl {
    // a text, so that the same question is the same value
    const query = computed(() => {
      const writer = author();
      const others = recipients();
      return writer === undefined || others.length === 0
        ? undefined
        : JSON.stringify([writer, ...others]);
    });
    const requests = queryResource(
      query,
      (asked): Observable<readonly MemberRequest[] | null> => {
        if (asked === undefined) {
          return of(null);
        }
        const [, ...others] = JSON.parse(asked) as string[];
        return from(others).pipe(
          concatMap((name) =>
            this.api.get<readonly MemberRequest[] | null>(`${pathOf(name)}/requests`, {
              done: 'true',
            }),
          ),
          reduce<readonly MemberRequest[] | null, MemberRequest[]>(
            (all, list) => [...all, ...(Array.isArray(list) ? list : [])],
            [],
          ),
        );
      },
      { intervalMs: POLL_EVERY_MS },
    );
    const removing = signal<number | undefined>(undefined);
    const failure = signal<FailedWrittenRemoval | undefined>(undefined);
    effect(() => {
      query();
      untracked(() => failure.set(undefined));
    });

    return {
      ...requests,
      asked: query,
      removing: removing.asReadonly(),
      failure: failure.asReadonly(),
      remove: (recipient, id) => {
        if (removing() !== undefined) {
          return;
        }
        removing.set(id);
        failure.set(undefined);
        const readAgain = () => void requests.refresh().then(() => removing.set(undefined));
        this.api.delete<unknown>(`${pathOf(recipient)}/requests/${id}`).subscribe({
          error: (failed: unknown) => {
            failure.set({ id, error: toApiError(failed) });
            readAgain();
          },
          complete: readAgain,
        });
      },
    };
  }
}

function pathOf(member: string): string {
  return `/household/member/${encodeURIComponent(member)}`;
}
