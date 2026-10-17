import { windowStateIcon, windowStateLabel } from '../../shared/room-heating/window-labels';
import {
  blindPositionLabel,
  runOutcomeLabel,
  scheduleActionLabel,
  scheduleDecisionLabel,
  shortWindowLabel,
} from './room-labels';

// the words of the room view for what the services send (HAS-232): every value they are documented
// to send has its text, and one this version does not know has none - the caller prints it as it came
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

  it('names the outcomes, the actions and the decisions of the schedules', () => {
    expect(['moved', 'failed', 'unsupported', 'paused'].map(runOutcomeLabel)).toEqual([
      'rooms.schedules.outcome.moved',
      'rooms.schedules.outcome.failed',
      'rooms.schedules.outcome.unsupported',
      'rooms.schedules.outcome.paused',
    ]);
    expect(runOutcomeLabel('skipped')).toBeUndefined();
    expect(['open', 'close', 'position', 'tilt'].map(scheduleActionLabel)).toEqual([
      'rooms.schedules.action.open',
      'rooms.schedules.action.close',
      'rooms.schedules.action.position',
      undefined,
    ]);
    expect(scheduleDecisionLabel('waiting for the conditions')).toBe(
      'rooms.schedules.decision.waiting',
    );
    expect(scheduleDecisionLabel('fires')).toBe('rooms.schedules.decision.fires');
    expect(scheduleDecisionLabel(undefined)).toBeUndefined();
    expect(scheduleDecisionLabel('something new')).toBeUndefined();
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
