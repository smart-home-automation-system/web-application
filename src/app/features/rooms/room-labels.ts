import { MessageKey } from '../../i18n/messages';
import { WindowStateView } from '../../shared/room-heating/room-views';

/** The windows of a room in one word, for the line of its card; "no sensor" is said by the count. */
export function shortWindowLabel(state: WindowStateView): MessageKey {
  return state === 'open'
    ? 'rooms.window.open'
    : state === 'closed'
      ? 'rooms.window.closed'
      : 'rooms.window.unknown';
}
