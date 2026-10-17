import { MessageKey } from '../../i18n/messages';
import { WindowStateView } from '../../shared/room-heating/room-views';
import { BlindRow } from './room-overview';

/** What a blind is at, in short: the key of the text and, for a position, the number. */
export interface BlindPosition {
  readonly key: MessageKey;
  readonly position?: number;
}

/**
 * What a blind is at: its position where it reports one, else its state, else "not known" -
 * never "closed" for a blind that said nothing.
 */
export function blindPositionLabel(row: BlindRow): BlindPosition {
  const state = row.state;
  if (typeof state?.position === 'number' && Number.isFinite(state.position)) {
    return { key: 'rooms.blinds.position', position: state.position };
  }
  switch (state?.state) {
    case 'opened':
      return { key: 'rooms.blinds.state.opened' };
    case 'closed':
      return { key: 'rooms.blinds.state.closed' };
    case 'stopped':
      return { key: 'rooms.blinds.state.stopped' };
    case 'opening':
      return { key: 'rooms.blinds.state.opening' };
    case 'closing':
      return { key: 'rooms.blinds.state.closing' };
    default:
      return { key: 'rooms.blinds.state.unknown' };
  }
}

/** The windows of a room in one word, for the line of its card; "no sensor" is said by the count. */
export function shortWindowLabel(state: WindowStateView): MessageKey {
  return state === 'open'
    ? 'rooms.window.open'
    : state === 'closed'
      ? 'rooms.window.closed'
      : 'rooms.window.unknown';
}

/** What came of the run of a schedule for a blind; a value this version does not know is printed as it came. */
export function runOutcomeLabel(outcome: string | undefined): MessageKey | undefined {
  switch (outcome) {
    case 'moved':
      return 'rooms.schedules.outcome.moved';
    case 'failed':
      return 'rooms.schedules.outcome.failed';
    case 'unsupported':
      return 'rooms.schedules.outcome.unsupported';
    case 'paused':
      return 'rooms.schedules.outcome.paused';
    default:
      return undefined;
  }
}

/** What a schedule does; a value this version does not know is printed as it came. */
export function scheduleActionLabel(action: string | undefined): MessageKey | undefined {
  switch (action) {
    case 'open':
      return 'rooms.schedules.action.open';
    case 'close':
      return 'rooms.schedules.action.close';
    case 'position':
      return 'rooms.schedules.action.position';
    default:
      return undefined;
  }
}

const DECISIONS: Readonly<Record<string, MessageKey>> = {
  disabled: 'rooms.schedules.decision.disabled',
  'not today': 'rooms.schedules.decision.notToday',
  'no window today': 'rooms.schedules.decision.noWindow',
  'fired today': 'rooms.schedules.decision.fired',
  'before the window': 'rooms.schedules.decision.before',
  'after the window': 'rooms.schedules.decision.after',
  'no blind of its targets is known': 'rooms.schedules.decision.noBlinds',
  'waiting for the conditions': 'rooms.schedules.decision.waiting',
  fires: 'rooms.schedules.decision.fires',
};

/** What a schedule does in this minute, the values of `Verdict` of blinds-service; one this version does not know is printed as it came. */
export function scheduleDecisionLabel(decision: string | undefined): MessageKey | undefined {
  return decision === undefined ? undefined : DECISIONS[decision];
}
