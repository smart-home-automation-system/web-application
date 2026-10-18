import { Blind } from '../../data-access/blinds/blinds-api';
import { MessageKey } from '../../i18n/messages';

/** What a blind is at, in short: the key of the text and, for a position, the number. */
export interface BlindPosition {
  readonly key: MessageKey;
  readonly position?: number;
}

/** The states `blinds-service` sends (`BlindState`), in its words. */
export const BLIND_STATES = ['open', 'closed', 'opening', 'closing', 'stopped'] as const;

/**
 * What a blind is at: its position where it reports one, else its state, else "not known" -
 * never "closed" for a blind that said nothing. The window of a room and the blinds page.
 *
 * The states are the words of `BlindState` of `blinds-service` - `open`, not `opened` (0.21.0 read
 * `opened`, a word the service never sends, so an open Eaton blind, which has no position, was
 * "not known"). `BLIND_STATES` is that list, pinned by a test.
 */
export function blindPositionLabel<T extends { readonly state?: Blind }>(row: T): BlindPosition {
  const state = row.state;
  if (typeof state?.position === 'number' && Number.isFinite(state.position)) {
    return { key: 'blindControl.position', position: state.position };
  }
  switch (state?.state) {
    case 'open':
      return { key: 'blindControl.state.open' };
    case 'closed':
      return { key: 'blindControl.state.closed' };
    case 'stopped':
      return { key: 'blindControl.state.stopped' };
    case 'opening':
      return { key: 'blindControl.state.opening' };
    case 'closing':
      return { key: 'blindControl.state.closing' };
    default:
      return { key: 'blindControl.state.unknown' };
  }
}
