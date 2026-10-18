import { signal } from '@angular/core';
import { FormControl } from '@angular/forms';

import {
  ScheduleCondition,
  ScheduleTarget,
  WindowEnd,
} from '../../../data-access/blinds/blind-schedule';
import { validator } from '../../../shared/form-rules/form-rules';
import {
  boundsProblem,
  decimalOf,
  holdProblem,
  isTruth,
  METRICS,
  offsetProblem,
  thresholdProblem,
  timeProblem,
} from './schedule-rules';

/**
 * The parts of the form of a schedule that come more than once - the two ends of the window and
 * the rows of the conditions - each with its controls and what it sends. A text field is a form
 * control with the rule of the service as its validator; a choice is a signal.
 */

/** One end of the window: a clock time, or the sunrise / sunset moved and held between two times. */
export class WindowEndForm {
  readonly kind = signal<string>('clock');

  readonly time = new FormControl('', {
    nonNullable: true,
    validators: validator((text) =>
      this.kind() === 'clock' ? timeProblem(text, true) : undefined,
    ),
  });
  readonly offset = new FormControl('0', {
    nonNullable: true,
    validators: validator((text) => (this.kind() === 'clock' ? undefined : offsetProblem(text))),
  });
  readonly earliest = new FormControl('', {
    nonNullable: true,
    validators: validator((text) =>
      this.kind() === 'clock' ? undefined : timeProblem(text, false),
    ),
  });
  readonly latest = new FormControl('', {
    nonNullable: true,
    validators: validator((text) =>
      this.kind() === 'clock'
        ? undefined
        : (timeProblem(text, false) ?? boundsProblem(this.earliest.value.trim(), text.trim())),
    ),
  });

  constructor() {
    // the latest is checked against the earliest: a change of either is a change of that rule
    this.earliest.valueChanges.subscribe(() => this.latest.updateValueAndValidity());
  }

  setKind(kind: string): void {
    this.kind.set(kind);
    for (const control of this.controls()) {
      control.updateValueAndValidity();
    }
  }

  fill(end: WindowEnd | undefined): void {
    this.kind.set(end?.kind ?? 'clock');
    this.time.setValue(end?.time ?? '');
    this.offset.setValue(end?.offsetMinutes === undefined ? '0' : String(end.offsetMinutes));
    this.earliest.setValue(end?.earliest ?? '');
    this.latest.setValue(end?.latest ?? '');
  }

  controls(): readonly FormControl<string>[] {
    return [this.time, this.offset, this.earliest, this.latest];
  }

  /** The end as it is sent: only the fields of its kind - the service refuses the others. */
  value(): WindowEnd {
    const kind = this.kind();
    if (kind === 'clock') {
      return { kind, time: this.time.value.trim() };
    }
    const earliest = this.earliest.value.trim();
    const latest = this.latest.value.trim();
    return {
      kind,
      offsetMinutes: Number(this.offset.value.trim()),
      ...(earliest === '' ? {} : { earliest }),
      ...(latest === '' ? {} : { latest }),
    };
  }
}

let rows = 0;

/** A row of the conditions: a metric compared with a threshold, or a truth, held for minutes. */
export class ConditionForm {
  /** What the row is tracked by: two rows may say the same. */
  readonly key = rows++;
  readonly metric = signal<string>(METRICS[0]);
  readonly operator = signal<string>('gt');
  /** For a truth: `is true` or `is false`. */
  readonly truth = signal(true);

  readonly threshold = new FormControl('', {
    nonNullable: true,
    validators: validator((text) =>
      isTruth(this.metric()) ? undefined : thresholdProblem(text, this.metric()),
    ),
  });
  readonly hold = new FormControl('0', {
    nonNullable: true,
    validators: validator(holdProblem),
  });

  constructor(condition?: ScheduleCondition) {
    if (condition === undefined) {
      return;
    }
    this.metric.set(condition.metric ?? METRICS[0]);
    this.operator.set(condition.operator === 'lt' ? 'lt' : 'gt');
    this.truth.set(condition.value !== false);
    this.threshold.setValue(
      typeof condition.threshold === 'number' ? String(condition.threshold) : '',
    );
    this.hold.setValue(
      typeof condition.holdMinutes === 'number' ? String(condition.holdMinutes) : '0',
    );
  }

  setMetric(metric: string): void {
    this.metric.set(metric);
    // the range of the threshold is the metric's
    this.threshold.updateValueAndValidity();
  }

  controls(): readonly FormControl<string>[] {
    return [this.threshold, this.hold];
  }

  /** The condition as it is sent: a threshold or a truth, never both. */
  value(): ScheduleCondition {
    const metric = this.metric();
    const holdMinutes = Number(this.hold.value.trim());
    return isTruth(metric)
      ? { metric, operator: 'is', value: this.truth(), holdMinutes }
      : {
          metric,
          operator: this.operator(),
          threshold: decimalOf(this.threshold.value),
          holdMinutes,
        };
  }
}

/** A target as the select holds it: `room:office`, `blind:7`. */
export function targetKey(target: ScheduleTarget): string | undefined {
  if (typeof target.deviceId === 'number') {
    return `blind:${target.deviceId}`;
  }
  return target.room === undefined ? undefined : `room:${target.room}`;
}

export function targetOf(key: string): ScheduleTarget {
  return key.startsWith('blind:')
    ? { deviceId: Number(key.slice('blind:'.length)) }
    : { room: key.slice('room:'.length) };
}
