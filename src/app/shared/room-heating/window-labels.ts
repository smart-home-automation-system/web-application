import { MessageKey } from '../../i18n/messages';
import { WindowStateView } from './room-views';

const STATE_LABELS: Record<WindowStateView, MessageKey> = {
  open: 'window.open',
  closed: 'window.closed',
  'no sensor': 'window.noSensor',
  unknown: 'window.unknown',
};

const STATE_ICONS: Record<WindowStateView, string> = {
  open: 'sensor_window',
  closed: 'window',
  'no sensor': 'sensors_off',
  unknown: 'help',
};

/** The windows of a room or of a blind in words - "not heard of" where they are not known, never "closed". */
export function windowStateLabel(state: WindowStateView): MessageKey {
  return STATE_LABELS[state];
}

/** Name of a Material Symbols icon. */
export function windowStateIcon(state: WindowStateView): string {
  return STATE_ICONS[state];
}
