import { Signal, WritableSignal, computed, inject, signal } from '@angular/core';

import { QueryResource } from '../../core/api/query-resource';
import { APP_CONFIG } from '../../core/config/app-config';
import {
  HistoryPreset,
  HistoryRange,
  historyRange,
  sameRange,
} from '../../core/time/history-range';
import { Ticker } from '../../core/time/ticker';
import { axisOf } from './chart-data';

/** The period a history is looked at for, and the range that follows from it and the clock. */
export interface HistoryPeriod {
  readonly preset: WritableSignal<HistoryPreset>;
  /**
   * The range to ask for. It moves on with the clock of the house - at the next full hour, or
   * at midnight - and is the same object for as long as it is the same range, which is what a
   * `queryResource` and the view compare by.
   */
  readonly range: Signal<HistoryRange>;
  /** Which period a range of this history was made for; `undefined` for any other object. */
  presetOf(range: HistoryRange): HistoryPreset | undefined;
}

/** Call in an injection context. A history opens on the last 24 hours. */
export function historyPeriod(initial: HistoryPreset = 'day'): HistoryPeriod {
  const zone = inject(APP_CONFIG).houseTimeZone;
  const ticker = inject(Ticker);
  const preset = signal(initial);
  const made = new WeakMap<HistoryRange, HistoryPreset>();
  const range = computed(
    () => {
      const chosen = preset();
      const next = historyRange(chosen, ticker.now(), zone);
      made.set(next, chosen);
      return next;
    },
    // the same range of another period is another question: "7 days" is never the object of "24 h"
    { equal: (a, b) => sameRange(a, b) && made.get(a) === made.get(b) },
  );
  return { preset, range, presetOf: (asked) => made.get(asked) };
}

/** What a view may show of a history whose range can change under it. */
export interface ShownHistory<T> {
  /**
   * True while there is nothing of the period on screen to show or to tell: no answer for it,
   * and its last call - answered or failed - not ended. Until then the resource still holds the
   * answer, the failure and the freshness of the period before.
   */
  readonly waiting: Signal<boolean>;
  /** The answer to show; `undefined` while there is none for the period on screen. */
  readonly answer: Signal<T | undefined>;
  /** The ends of the range that answer is for, on the wall-clock timeline: the axis of its chart. */
  readonly axis: Signal<{ readonly from: number; readonly to: number } | undefined>;
}

/**
 * Call in an injection context.
 *
 * Two things change the range, and they are not the same to whoever looks at the chart.
 * **Another period** is another question: the answer on screen is not shown under it for the
 * length of a call. **The clock moving on** - a new hour, a new day - is the same question an
 * hour later: the chart of the hour before stays, on its own axis, until the new answer
 * arrives, and stays also when that one call fails.
 */
export function shownHistory<T>(
  resource: QueryResource<HistoryRange, T>,
  period: HistoryPeriod,
): ShownHistory<T> {
  const shown = computed(() => {
    const answered = resource.value();
    return answered !== undefined && period.presetOf(answered.query) === period.preset()
      ? answered
      : undefined;
  });
  return {
    waiting: computed(() => {
      const settled = resource.settledFor();
      return (
        shown() === undefined &&
        (settled === undefined || period.presetOf(settled.query) !== period.preset())
      );
    }),
    answer: computed(() => shown()?.answer),
    axis: computed(() => {
      const answered = shown();
      return answered === undefined ? undefined : axisOf(answered.query);
    }),
  };
}
