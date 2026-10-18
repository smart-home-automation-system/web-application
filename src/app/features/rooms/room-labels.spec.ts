import { windowStateIcon, windowStateLabel } from '../../shared/room-heating/window-labels';
import { blindPositionLabel, shortWindowLabel } from './room-labels';

// the words of the room view for what the services send (HAS-232): what a service did not say is
// "not known", never closed
describe('room labels', () => {
  const blind = { device: { id: 1 } };

  it('says what a blind does without a position, and "not known" without a state', () => {
    for (const state of ['opened', 'closed', 'stopped', 'opening', 'closing']) {
      expect(blindPositionLabel({ ...blind, state: { state } }).key).toBe(
        `rooms.blinds.state.${state}`,
      );
    }
    expect(blindPositionLabel({ ...blind, state: { state: 'jammed' } }).key).toBe(
      'rooms.blinds.state.unknown',
    );
    expect(blindPositionLabel({ ...blind, state: { position: Number.NaN } }).key).toBe(
      'rooms.blinds.state.unknown',
    );
  });

  it('names the windows in full and in short', () => {
    expect(
      ['open', 'closed', 'no sensor', 'unknown'].map((state) => windowStateLabel(state as 'open')),
    ).toEqual(['window.open', 'window.closed', 'window.noSensor', 'window.unknown']);
    expect(windowStateIcon('open')).toBe('sensor_window');
    expect(shortWindowLabel('open')).toBe('rooms.window.open');
    expect(shortWindowLabel('closed')).toBe('rooms.window.closed');
    expect(shortWindowLabel('no sensor')).toBe('rooms.window.unknown');
  });
});
