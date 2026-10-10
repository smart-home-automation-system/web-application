import { Signal, effect, signal, untracked } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { PollingOptions, PollingResource, pollingResource } from './polling-resource';

/**
 * An answer together with the question it answers. A report is asked for a range somebody can
 * change, and the answer for the old range stays on screen until the new one arrives: the view
 * compares `query` with what it shows the controls for.
 */
export interface Answered<Q, T> {
  readonly query: Q;
  readonly answer: T;
}

/**
 * A resource whose question can change. Next to the answer it says which question its last
 * call - answered *or failed* - was for: the error and the freshness of the resource are those
 * of that question, and until it is the one on screen the view has nothing to show but that it
 * is waiting.
 */
export interface QueryResource<Q, T> extends PollingResource<Answered<Q, T>> {
  /** `undefined` until the first call has ended. */
  readonly settledFor: Signal<{ readonly query: Q } | undefined>;
}

/**
 * Polls `load` with what `query()` gives, and asks again at once whenever that changes; the
 * answer to the old question, still on its way, is dropped. `query` has to be a signal with an
 * `equal`, so that the same question is the same object - the view compares by identity.
 *
 * Must be called in an injection context, like `pollingResource`: the polling stops with the
 * component or service that created it.
 */
export function queryResource<Q, T>(
  query: () => Q,
  load: (asked: Q) => Observable<T>,
  options: PollingOptions,
): QueryResource<Q, T> {
  const settledFor = signal<{ readonly query: Q } | undefined>(undefined);
  const resource = pollingResource(() => {
    // read when the call is made: the answer is tagged with exactly what was asked
    const asked = untracked(query);
    const settle = () => settledFor.set({ query: asked });
    return load(asked).pipe(
      map((answer) => ({ query: asked, answer })),
      tap({ next: settle, error: settle }),
    );
  }, options);
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
  return { ...resource, settledFor: settledFor.asReadonly() };
}
