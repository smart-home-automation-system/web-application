import { DOCUMENT } from '@angular/common';
import { DestroyRef, Signal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  EMPTY,
  Observable,
  Subject,
  catchError,
  distinctUntilChanged,
  exhaustMap,
  fromEvent,
  map,
  of,
  startWith,
  switchMap,
  timer,
} from 'rxjs';

import { Ticker } from '../time/ticker';
import { ApiError, toApiError } from './api-error';

export interface PollingOptions {
  /** Pause between two calls. */
  readonly intervalMs: number;
  /** Age after which the value counts as stale; 2.5 intervals by default. */
  readonly staleAfterMs?: number;
}

/** A backend resource kept fresh by polling, as signals. */
export interface PollingResource<T> {
  /** The last value received; kept when a later call fails. */
  readonly value: Signal<T | undefined>;
  /** The failure of the last call; cleared by the next success. */
  readonly error: Signal<ApiError | undefined>;
  /** Epoch milliseconds of the last successful call. */
  readonly lastUpdated: Signal<number | undefined>;
  /** True until the first call has answered, one way or the other. */
  readonly loading: Signal<boolean>;
  /** True when the value on screen can no longer be trusted: too old, or the last call failed. */
  readonly stale: Signal<boolean>;
  /** Calls now and restarts the interval; an answer still on its way is dropped. */
  refresh(): void;
}

/**
 * Polls `load` for as long as the caller lives and the tab is visible. A hidden tab makes no
 * calls; coming back triggers one at once. A slow answer delays the next call instead of
 * overlapping with it.
 *
 * Must be called in an injection context (a field initialiser or constructor): the polling
 * stops with the component or service that created it.
 *
 * This is the one place that knows the transport - a move to server-sent events replaces this
 * function and nothing that uses it.
 */
export function pollingResource<T>(
  load: () => Observable<T>,
  options: PollingOptions,
): PollingResource<T> {
  const document = inject(DOCUMENT);
  const ticker = inject(Ticker);
  const destroyRef = inject(DestroyRef);
  const staleAfterMs = options.staleAfterMs ?? options.intervalMs * 2.5;

  const value = signal<T | undefined>(undefined);
  const error = signal<ApiError | undefined>(undefined);
  const lastUpdated = signal<number | undefined>(undefined);
  const loading = signal(true);
  const refreshRequests = new Subject<void>();

  const visible$ = fromEvent(document, 'visibilitychange').pipe(
    startWith(undefined),
    map(() => document.visibilityState !== 'hidden'),
    distinctUntilChanged(),
  );

  type Outcome = { ok: true; value: T } | { ok: false; error: ApiError };

  // one attempt; a failure becomes a value, so it never ends the polling
  const attempt = () =>
    load().pipe(
      map((loaded): Outcome => ({ ok: true, value: loaded })),
      catchError((failure: unknown) => of<Outcome>({ ok: false, error: toApiError(failure) })),
    );
  // every refresh request restarts the interval, dropping the call that is on its way
  const whileVisible$ = refreshRequests.pipe(
    startWith(undefined),
    switchMap(() => timer(0, options.intervalMs).pipe(exhaustMap(attempt))),
  );

  visible$
    .pipe(
      // the interval lives inside this switchMap, so hiding the tab really stops it
      switchMap((visible) => (visible ? whileVisible$ : EMPTY)),
      takeUntilDestroyed(destroyRef),
    )
    .subscribe((outcome) => {
      if (outcome.ok) {
        value.set(outcome.value);
        error.set(undefined);
        lastUpdated.set(Date.now());
      } else {
        error.set(outcome.error);
      }
      loading.set(false);
    });

  const stale = computed(() => {
    if (error() !== undefined) {
      return true;
    }
    const updated = lastUpdated();
    return updated !== undefined && ticker.now() - updated > staleAfterMs;
  });

  return {
    value: value.asReadonly(),
    error: error.asReadonly(),
    lastUpdated: lastUpdated.asReadonly(),
    loading: loading.asReadonly(),
    stale,
    refresh: () => refreshRequests.next(),
  };
}
