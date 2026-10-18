import { Blind } from '../../data-access/blinds/blinds-api';
import { MessageKey } from '../../i18n/messages';

/** What a blind is at, in short: the key of the text and, for a position, the number. */
export interface BlindPosition {
  readonly key: MessageKey;
  readonly position?: number;
}

/**
 * What a blind is at: its position where it reports one, else its state, else "not known" -
 * never "closed" for a blind that said nothing. The window of a room and the blinds page.
 */
export function blindPositionLabel<T extends { readonly state?: Blind }>(row: T): BlindPosition {
  const state = row.state;
  if (typeof state?.position === 'number' && Number.isFinite(state.position)) {
    return { key: 'blindControl.position', position: state.position };
  }
  switch (state?.state) {
    case 'opened':
      return { key: 'blindControl.state.opened' };
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
