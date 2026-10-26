import { ApiError } from '../../core/api/api-error';
import { Appliance, FailedAcknowledgement } from '../../data-access/appliance/appliance-api';
import { DisplayText, MessageKey } from '../../i18n/messages';
import { describeApiError } from '../api-error/describe-api-error';

/** The states of `appliance-service` this version has words for; another one is "not known". */
export type ApplianceState = 'idle' | 'running' | 'finishing' | 'finished';

export const APPLIANCE_STATE_LABELS: Readonly<Record<ApplianceState, MessageKey>> = {
  idle: 'appliances.state.idle',
  running: 'appliances.state.running',
  finishing: 'appliances.state.finishing',
  finished: 'appliances.state.finished',
};

/**
 * An appliance as the views show it. What the answer leaves out stays `undefined` - a state this
 * version does not know is no state, never "idle" - and an appliance without an id is not shown:
 * nothing could be acknowledged for it.
 */
export interface ApplianceView {
  readonly id: number;
  /** The name of the registry, printed as it is; the id when the answer has none. */
  readonly name: string;
  readonly state: ApplianceState | undefined;
  readonly runningSince: string | undefined;
  readonly finishedAt: string | undefined;
  readonly awaitingSince: string | undefined;
}

export function toApplianceViews(answer: readonly Appliance[] | null | undefined): ApplianceView[] {
  if (!Array.isArray(answer)) {
    return [];
  }
  return answer
    .filter((appliance): appliance is Appliance & { id: number } => isId(appliance.id))
    .map((appliance) => ({
      id: appliance.id,
      name:
        typeof appliance.name === 'string' && appliance.name !== ''
          ? appliance.name
          : `#${appliance.id}`,
      state: stateOf(appliance.state),
      runningSince: textOf(appliance.runningSince),
      finishedAt: textOf(appliance.finishedAt),
      awaitingSince: textOf(appliance.awaitingSince),
    }));
}

/**
 * The appliances whose finished cycle waits to be acknowledged - what the notice of the shell
 * announces and the card offers to acknowledge.
 */
export function awaiting(views: readonly ApplianceView[]): ApplianceView[] {
  return views.filter((view) => view.state === 'finished');
}

/** The tile of the overview: what runs (a pause of a cycle included), what waits, what is not known. */
export interface AppliancesSummary {
  readonly running: readonly string[];
  readonly waiting: readonly string[];
  readonly unknown: number;
}

export function summariseAppliances(views: readonly ApplianceView[]): AppliancesSummary {
  return {
    running: views
      .filter((view) => view.state === 'running' || view.state === 'finishing')
      .map((view) => view.name),
    waiting: views.filter((view) => view.state === 'finished').map((view) => view.name),
    unknown: views.filter((view) => view.state === undefined).length,
  };
}

/**
 * The named refusals of `appliance-service` (`ApplianceError`, whose constant names are wire
 * contract there, pinned by `ApplianceErrorTest`), each with a sentence of our own. A new or renamed
 * code needs a text here - the test of this file lists them.
 */
export const APPLIANCE_ERROR_TEXTS: Readonly<Record<string, MessageKey>> = {
  NOT_FOUND_APPLIANCE: 'appliances.error.notFound',
  NOTHING_TO_ACKNOWLEDGE: 'appliances.error.nothingToAcknowledge',
  // HAS-347: the profile in use is no switched-on member of the registry any more
  UNKNOWN_MEMBER: 'appliances.error.unknownMember',
};

export function describeApplianceError(error: ApiError): DisplayText {
  const named = Object.entries(APPLIANCE_ERROR_TEXTS).find(([code]) => error.hasCode(code));
  return named ? { key: named[1] } : describeApiError(error);
}

/**
 * A failed acknowledgement in words: one that got no answer may have been carried out all the same,
 * and the list read after it says which.
 */
export function acknowledgeFailureOf(failure: FailedAcknowledgement): DisplayText {
  return failure.error.kind === 'network'
    ? { key: 'appliances.acknowledgeNoAnswer' }
    : describeApplianceError(failure.error);
}

const TIME_ONLY: Intl.DateTimeFormatOptions = { timeStyle: 'short' };
const DATE_AND_TIME: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };

/**
 * How a time of a cycle (a house wall-clock text) is shown: the time alone on the day of the house
 * it is today, with the date on any other - a dishwasher that finished last night and still waits
 * is not "since 23:40" of today. `today` is `houseDay` of the house now.
 */
export function cycleTimeFormat(text: string, today: string): Intl.DateTimeFormatOptions {
  return text.startsWith(`${today}T`) ? TIME_ONLY : DATE_AND_TIME;
}

function stateOf(state: unknown): ApplianceState | undefined {
  return typeof state === 'string' && Object.hasOwn(APPLIANCE_STATE_LABELS, state)
    ? (state as ApplianceState)
    : undefined;
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function isId(id: unknown): id is number {
  return typeof id === 'number' && Number.isInteger(id) && id > 0;
}
