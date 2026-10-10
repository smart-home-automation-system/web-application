import { WritableSignal, signal } from '@angular/core';

import { ApiError } from '../app/core/api/api-error';
import { PollingResource } from '../app/core/api/polling-resource';
import { Answered } from '../app/core/api/query-resource';

/** A polled resource whose every signal the test sets by hand. */
export interface FakeResource<T> extends PollingResource<T> {
  readonly value: WritableSignal<T | undefined>;
  readonly error: WritableSignal<ApiError | undefined>;
  readonly loading: WritableSignal<boolean>;
  readonly stale: WritableSignal<boolean>;
  readonly lastUpdated: WritableSignal<number | undefined>;
}

/** A resource whose first call has not answered yet. */
export function fakeResource<T>(): FakeResource<T> {
  return {
    value: signal<T | undefined>(undefined),
    error: signal<ApiError | undefined>(undefined),
    loading: signal(true),
    stale: signal(false),
    lastUpdated: signal<number | undefined>(undefined),
    refresh: () => Promise.resolve(),
  };
}

/** The call answered. */
export function answer<T>(resource: FakeResource<T>, value: T): void {
  resource.value.set(value);
  resource.error.set(undefined);
  resource.loading.set(false);
  resource.stale.set(false);
  resource.lastUpdated.set(Date.now());
}

/** The call failed; whatever was answered before stays, out of date. */
export function fail<T>(resource: FakeResource<T>, error: ApiError): void {
  resource.error.set(error);
  resource.loading.set(false);
  resource.stale.set(true);
}

/** A resource of a question that can change, whose every signal the test sets by hand. */
export interface FakeQueryResource<Q, T> extends FakeResource<Answered<Q, T>> {
  readonly settledFor: WritableSignal<{ readonly query: Q } | undefined>;
}

/** A resource whose first call has not ended yet. */
export function fakeQueryResource<Q, T>(): FakeQueryResource<Q, T> {
  return { ...fakeResource<Answered<Q, T>>(), settledFor: signal(undefined) };
}

/** The call for `query` answered. */
export function answerQuery<Q, T>(resource: FakeQueryResource<Q, T>, query: Q, value: T): void {
  answer(resource, { query, answer: value });
  resource.settledFor.set({ query });
}

/** The call for `query` failed; whatever was answered before stays, out of date. */
export function failQuery<Q, T>(
  resource: FakeQueryResource<Q, T>,
  query: Q,
  error: ApiError,
): void {
  fail(resource, error);
  resource.settledFor.set({ query });
}
