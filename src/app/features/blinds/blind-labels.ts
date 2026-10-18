import { ScheduleCondition, WindowEnd } from '../../data-access/blinds/blind-schedule';
import { DisplayText, MessageKey } from '../../i18n/messages';

/**
 * The words of the blinds page (HAS-252) for the values of `blinds-service`. Every one of them is
 * the service's word: a value this version does not know is printed as it came (a `literal`),
 * never read as one it knows.
 */

function wordOf(labels: Readonly<Record<string, MessageKey>>, value: string | undefined) {
  return value !== undefined && Object.hasOwn(labels, value) ? labels[value] : undefined;
}

function textOf(
  labels: Readonly<Record<string, MessageKey>>,
  value: string | undefined,
  missing: MessageKey,
): DisplayText {
  if (value === undefined) {
    return { key: missing };
  }
  const key = wordOf(labels, value);
  return key ? { key } : { literal: value };
}

const SOURCES: Readonly<Record<string, MessageKey>> = {
  dashboard: 'blinds.source.dashboard',
  schedule: 'blinds.source.schedule',
  protection: 'blinds.source.protection',
  external: 'blinds.source.external',
};

/** Who moved a blind last: a command of the service, or the word of the device itself (`SHC`). */
export function sourceText(source: string | undefined): DisplayText {
  return textOf(SOURCES, source, 'blinds.source.unknown');
}

export const DAY_TYPE_LABELS: Readonly<Record<string, MessageKey>> = {
  workday: 'blinds.schedule.dayType.workday',
  'day off': 'blinds.schedule.dayType.dayOff',
  any: 'blinds.schedule.dayType.any',
};

export function dayTypeText(dayType: string | undefined): DisplayText {
  return textOf(DAY_TYPE_LABELS, dayType, 'blinds.schedule.dayType.unknown');
}

/** What a schedule does to its blinds; a position with its number. */
export function actionText(action: string | undefined, position: number | undefined): DisplayText {
  if (action === 'position') {
    return typeof position === 'number' && Number.isFinite(position)
      ? { key: 'blinds.schedule.action.position', params: { position } }
      : { key: 'blinds.schedule.action.positionUnknown' };
  }
  return textOf(
    { open: 'blinds.schedule.action.open', close: 'blinds.schedule.action.close' },
    action,
    'blinds.schedule.action.unknown',
  );
}

const DECISIONS: Readonly<Record<string, MessageKey>> = {
  disabled: 'blinds.schedule.decision.disabled',
  'not today': 'blinds.schedule.decision.notToday',
  'no window today': 'blinds.schedule.decision.noWindow',
  'fired today': 'blinds.schedule.decision.fired',
  'before the window': 'blinds.schedule.decision.beforeWindow',
  'after the window': 'blinds.schedule.decision.afterWindow',
  'no blind of its targets is known': 'blinds.schedule.decision.noBlinds',
  'waiting for the conditions': 'blinds.schedule.decision.waiting',
  fires: 'blinds.schedule.decision.fires',
};

/** What the schedule does in this minute, in the engine's own order. */
export function decisionText(decision: string | undefined): DisplayText {
  return textOf(DECISIONS, decision, 'blinds.schedule.decision.unknown');
}

const OUTCOMES: Readonly<Record<string, MessageKey>> = {
  moved: 'blinds.schedule.outcome.moved',
  failed: 'blinds.schedule.outcome.failed',
  unsupported: 'blinds.schedule.outcome.unsupported',
  paused: 'blinds.schedule.outcome.paused',
};

/** What came of a run for one blind; `undefined` while it has not run in its window. */
export function outcomeText(outcome: string | undefined): DisplayText | undefined {
  return outcome === undefined
    ? undefined
    : textOf(OUTCOMES, outcome, 'blinds.schedule.outcome.unknown');
}

const CONDITION_STATES: Readonly<Record<string, MessageKey>> = {
  met: 'blinds.schedule.condition.state.met',
  holding: 'blinds.schedule.condition.state.holding',
  'not met': 'blinds.schedule.condition.state.notMet',
  unknown: 'blinds.schedule.condition.state.unknown',
  'per blind': 'blinds.schedule.condition.state.perBlind',
};

export function conditionStateText(state: string | undefined): DisplayText {
  return textOf(CONDITION_STATES, state, 'blinds.schedule.condition.state.unknown');
}

/** A metric of a condition: its name and the unit of its numbers (none for a truth). */
export interface Metric {
  readonly name: MessageKey;
  readonly unit?: string;
  /** For a truth: what `is true` and `is false` read as. */
  readonly truth?: { readonly yes: MessageKey; readonly no: MessageKey };
}

export const METRIC_LABELS: Readonly<Record<string, Metric>> = {
  illuminance: { name: 'blinds.schedule.metric.illuminance', unit: 'lx' },
  'outside temperature': { name: 'blinds.schedule.metric.outsideTemperature', unit: '°C' },
  'wind gust': { name: 'blinds.schedule.metric.windGust', unit: 'm/s' },
  raining: {
    name: 'blinds.schedule.metric.raining',
    truth: { yes: 'blinds.schedule.metric.raining', no: 'blinds.schedule.metric.notRaining' },
  },
  'window closed': {
    name: 'blinds.schedule.metric.windowClosed',
    truth: { yes: 'blinds.schedule.metric.windowClosed', no: 'blinds.schedule.metric.windowOpen' },
  },
};

/** A condition as it reads: what it compares, how, with what; the hold is told apart. */
export interface ConditionView {
  /** The metric and its test, e.g. "Illuminance" ">" 50 "lx", or "Raining". */
  readonly subject: DisplayText;
  /** `<` or `>`; left out for a truth. */
  readonly operator?: string;
  readonly threshold?: number;
  readonly unit?: string;
  /** Minutes it has to hold, when more than none. */
  readonly holdMinutes?: number;
  /** The value it was judged by now: a number with the unit, or a truth in words. */
  readonly current?: {
    readonly value?: number;
    readonly text?: DisplayText;
    readonly unit?: string;
  };
}

const OPERATORS: Readonly<Record<string, string>> = { lt: '<', gt: '>' };

export function conditionView(
  condition: ScheduleCondition & { readonly current?: number | boolean },
): ConditionView {
  const metric =
    condition.metric !== undefined && Object.hasOwn(METRIC_LABELS, condition.metric)
      ? METRIC_LABELS[condition.metric]
      : undefined;
  const hold =
    typeof condition.holdMinutes === 'number' && condition.holdMinutes > 0
      ? { holdMinutes: condition.holdMinutes }
      : {};
  const current = condition.current;
  const currentView =
    typeof current === 'number' && Number.isFinite(current)
      ? { current: { value: current, ...(metric?.unit ? { unit: metric.unit } : {}) } }
      : typeof current === 'boolean' && metric?.truth
        ? { current: { text: { key: current ? metric.truth.yes : metric.truth.no } } }
        : {};

  if (condition.operator === 'is' && metric?.truth) {
    const subject: DisplayText =
      condition.value === false ? { key: metric.truth.no } : { key: metric.truth.yes };
    return { subject, ...hold, ...currentView };
  }
  const subject: DisplayText = metric ? { key: metric.name } : { literal: condition.metric ?? '?' };
  const operator =
    condition.operator !== undefined
      ? (OPERATORS[condition.operator] ?? condition.operator)
      : undefined;
  return {
    subject,
    ...(operator !== undefined ? { operator } : {}),
    ...(typeof condition.threshold === 'number' && Number.isFinite(condition.threshold)
      ? { threshold: condition.threshold }
      : {}),
    ...(metric?.unit ? { unit: metric.unit } : {}),
    ...hold,
    ...currentView,
  };
}

/**
 * An end of the window as it is written in the schedule: a time, or the sunrise / sunset moved by
 * minutes and held between two times - "sunrise + 60 min, at the latest 09:00".
 */
export function windowEndText(end: WindowEnd | undefined): readonly DisplayText[] {
  if (end === undefined) {
    return [{ key: 'blinds.schedule.end.unknown' }];
  }
  if (end.kind === 'clock') {
    return [
      end.time !== undefined ? { literal: end.time } : { key: 'blinds.schedule.end.unknown' },
    ];
  }
  const sun = wordOf(
    { sunrise: 'blinds.schedule.end.sunrise', sunset: 'blinds.schedule.end.sunset' },
    end.kind,
  );
  if (!sun) {
    return [{ literal: end.kind ?? '?' }];
  }
  const offset = end.offsetMinutes;
  return [
    { key: sun },
    ...(typeof offset === 'number' && offset !== 0
      ? [
          {
            key: offset > 0 ? 'blinds.schedule.end.after' : 'blinds.schedule.end.before',
            params: { minutes: Math.abs(offset) },
          } as const,
        ]
      : []),
    // a time of the service is its text, never a parameter of a translation
    ...(end.earliest !== undefined
      ? [{ key: 'blinds.schedule.end.earliest' } as const, { literal: end.earliest }]
      : []),
    ...(end.latest !== undefined
      ? [{ key: 'blinds.schedule.end.latest' } as const, { literal: end.latest }]
      : []),
  ];
}
