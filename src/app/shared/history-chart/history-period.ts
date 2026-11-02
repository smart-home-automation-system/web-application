import { Signal, WritableSignal, computed, inject, signal } from '@angular/core';

import { ApiError } from '../../core/api/api-error';
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
  periodOrInput: HistoryPeriod | (() => HistoryPeriod),
): ShownHistory<T> {
  // a component given the period as an input reads it lazily: the input is set after its fields
  const periodOf = typeof periodOrInput === 'function' ? periodOrInput : () => periodOrInput;
  const shown = computed(() => {
    const period = periodOf();
    const answered = resource.value();
    return answered !== undefined && period.presetOf(answered.query) === period.preset()
      ? answered
      : undefined;
  });
  return {
    waiting: computed(() => {
      const period = periodOf();
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

/** The calls of the lines of one chart, as `combinedHistory` reads them. */
export interface LineHistory {
  readonly resource: QueryResource<HistoryRange, unknown>;
  readonly shown: ShownHistory<unknown>;
}

/** What a chart of several lines tells of its calls together. */
export interface CombinedHistory {
  /** The answer of some line for the period on screen has not arrived, one way or the other. */
  readonly waiting: Signal<boolean>;
  /** The failure of the first of its calls that failed. */
  readonly error: Signal<ApiError | undefined>;
  /** The oldest of the answers: the chart is as fresh as its stalest line. */
  readonly lastUpdated: Signal<number | undefined>;
  readonly stale: Signal<boolean>;
  /**
   * When the hour turns one line may already have the new range while another still shows the old
   * one: the axis spans both, so neither is cut at an end.
   */
  readonly axis: Signal<{ readonly from: number; readonly to: number } | undefined>;
}

/** The calls of the lines of one chart told as one - the weather and the energy charts. */
export function combinedHistory(histories: readonly LineHistory[]): CombinedHistory {
  return {
    waiting: computed(() => histories.some(({ shown }) => shown.waiting())),
    error: computed(() =>
      histories.map(({ resource }) => resource.error()).find((error) => error !== undefined),
    ),
    // the oldest of the answers there are; a line that never answered is told by its failure
    lastUpdated: computed(() => {
      const times = histories
        .map(({ resource }) => resource.lastUpdated())
        .filter((time): time is number => time !== undefined);
      return times.length === 0 ? undefined : Math.min(...times);
    }),
    stale: computed(() => histories.some(({ resource }) => resource.stale())),
    axis: computed(() => {
      const axes = histories
        .map(({ shown }) => shown.axis())
        .filter((axis): axis is { from: number; to: number } => axis !== undefined);
      return axes.length === 0
        ? undefined
        : {
            from: Math.min(...axes.map((axis) => axis.from)),
            to: Math.max(...axes.map((axis) => axis.to)),
          };
    }),
  };
}
