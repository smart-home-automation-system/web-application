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
  /** The ends of that range on the wall-clock timeline, for the axis of the chart. */
  readonly axis: Signal<{ readonly from: number; readonly to: number } | undefined>;
}

/** Call in an injection context. A history opens on the last 24 hours. */
export function historyPeriod(initial: HistoryPreset = 'day'): HistoryPeriod {
  const zone = inject(APP_CONFIG).houseTimeZone;
  const ticker = inject(Ticker);
  const preset = signal(initial);
  const range = computed(() => historyRange(preset(), ticker.now(), zone), { equal: sameRange });
  return { preset, range, axis: computed(() => axisOf(range())) };
}

/** What a view may show of a history whose range can change under it. */
export interface ShownHistory<T> {
  /**
   * True until the last call - answered or failed - was for the range on screen: until then the
   * resource still holds the answer, the failure and the freshness of the range before.
   */
  readonly waiting: Signal<boolean>;
  /** The answer for the range on screen; `undefined` while there is none. */
  readonly answer: Signal<T | undefined>;
}

/** Call in an injection context. */
export function shownHistory<T>(
  resource: QueryResource<HistoryRange, T>,
  range: Signal<HistoryRange>,
): ShownHistory<T> {
  return {
    waiting: computed(() => resource.settledFor()?.query !== range()),
    answer: computed(() => {
      const answered = resource.value();
      return answered !== undefined && answered.query === range() ? answered.answer : undefined;
    }),
  };
}
