import { ApiError } from '../../core/api/api-error';
import { GarageGate } from '../../data-access/gate/gate-api';
import {
  GARAGE_BUTTON_LABELS,
  GATE_ERROR_TEXTS,
  alertText,
  describeGateError,
  durationText,
  eventLine,
  garageStateOf,
  gateFailureOf,
  isWarning,
  openingSourceText,
} from './gate-labels';

describe('gate labels', () => {
  // the names of `GateError` of gate-service, pinned there by GateErrorTest: a new code needs a text here
  it('words every named refusal of gate-service', () => {
    expect(Object.keys(GATE_ERROR_TEXTS)).toEqual([
      'UNKNOWN_MEMBER',
      'OPEN_TOO_SOON',
      'DEVICE_FAILED',
      'GATE_UNAVAILABLE',
      'REGISTRY_UNAVAILABLE',
      'INVALID_RANGE',
      'NOT_FOUND_GATE',
    ]);
    expect(
      describeGateError(
        new ApiError('client', 409, [{ message: 'Open too soon', code: 'OPEN_TOO_SOON' }]),
      ),
    ).toEqual({ key: 'gate.error.openTooSoon' });
  });

  // a press that got no answer may have moved the gate all the same
  it('tells a press without an answer as one that may have been carried out', () => {
    expect(gateFailureOf({ sending: false, error: new ApiError('network', 0) })).toEqual({
      key: 'gate.commandFailed',
    });
    expect(
      gateFailureOf({
        sending: false,
        error: new ApiError('server', 502, [{ message: 'Device failed', code: 'DEVICE_FAILED' }]),
      }),
    ).toEqual({ key: 'gate.error.deviceFailed' });
  });

  // owner, 2026-11-18: a missing state is never read as closed
  it('reads a state the gate did not send, or a word it does not know, as not known', () => {
    const gate = (state?: string): GarageGate => ({
      id: 1,
      ...(state === undefined ? {} : { state }),
    });

    expect(garageStateOf(gate('open'))).toBe('open');
    expect(garageStateOf(gate('closed'))).toBe('closed');
    expect(garageStateOf(gate('unknown'))).toBe('unknown');
    expect(garageStateOf(gate())).toBe('unknown');
    expect(garageStateOf(gate('half-way'))).toBe('unknown');
  });

  // the one button of a garage gate: what a pulse does from the state it is in
  it('names the one button of a garage gate by what a pulse does', () => {
    expect(GARAGE_BUTTON_LABELS).toEqual({
      closed: 'gate.garage.open',
      open: 'gate.garage.close',
      unknown: 'gate.garage.run',
    });
  });

  it.each([
    [30_000, { key: 'gate.duration.underMinute' }],
    [18 * 60_000 + 59_000, { key: 'gate.duration.minutes', params: { minutes: 18 } }],
    [
      3 * 3_600_000 + 10 * 60_000,
      { key: 'gate.duration.hours', params: { hours: 3, minutes: 10 } },
    ],
    [2 * 86_400_000 + 5 * 3_600_000, { key: 'gate.duration.days', params: { days: 2, hours: 5 } }],
  ])('tells %d ms as %j', (ms, text) => {
    expect(durationText(ms)).toEqual(text);
  });

  it('words the alarms of a garage gate, a level not known being an alarm', () => {
    expect(alertText({ kind: 'cold' })).toEqual({ key: 'gate.alert.cold' });
    expect(alertText({ kind: 'empty house' })).toEqual({ key: 'gate.alert.emptyHouse' });
    expect(alertText({ kind: 'long' })).toEqual({ key: 'gate.alert.long' });
    expect(alertText({ kind: 'flood' })).toEqual({ literal: 'flood' });
    expect(isWarning({ level: 'warning' })).toBe(true);
    expect(isWarning({ level: 'alarm' })).toBe(false);
    expect(isWarning({})).toBe(false);
  });

  it('words where an opening came from', () => {
    expect(openingSourceText('screen')).toEqual({ key: 'gate.driveway.fromScreen' });
    expect(openingSourceText('dashboard')).toEqual({ key: 'gate.driveway.fromDashboard' });
    expect(openingSourceText('remote')).toEqual({ literal: 'remote' });
  });

  describe('a line of the timeline', () => {
    const names = (id: number) => (id === 31 ? 'Left' : undefined);

    it('words the station: a ring, an ended call, an unlock from the screen or another', () => {
      expect(eventLine({ kind: 'ring' }, names)).toEqual({ what: { key: 'gate.event.ring' } });
      expect(eventLine({ kind: 'dismissed' }, names)).toEqual({
        what: { key: 'gate.event.dismissed' },
      });
      expect(eventLine({ kind: 'unlock', unlockType: 'HOUSEHOLDER' }, names)).toEqual({
        what: { key: 'gate.event.unlockScreen' },
      });
      expect(eventLine({ kind: 'unlock', unlockType: 'CARD' }, names)).toEqual({
        what: { key: 'gate.event.unlock' },
      });
    });

    // the names from outside stay beside the words, never inside them
    it('words a command with its gate and who pressed, the screen without a member', () => {
      expect(
        eventLine(
          { kind: 'command', source: 'dashboard', member: 'Aurelia', outcome: 'pulsed', gate: 31 },
          names,
        ),
      ).toEqual({ what: { key: 'gate.event.pulsed' }, gate: 'Left', member: 'Aurelia' });
      expect(eventLine({ kind: 'command', source: 'screen', outcome: 'opened' }, names)).toEqual({
        what: { key: 'gate.event.openedScreen' },
      });
      expect(
        eventLine(
          { kind: 'command', source: 'dashboard', member: 'Borys', outcome: 'too soon' },
          names,
        ),
      ).toEqual({
        what: { key: 'gate.event.tooSoon' },
        member: 'Borys',
      });
      expect(eventLine({ kind: 'command', outcome: 'exploded', gate: 40 }, names)).toEqual({
        what: { literal: 'exploded' },
        gate: '#40',
      });
    });

    it('words a garage gate opened, and closed with how long it stood open', () => {
      expect(eventLine({ kind: 'garage', gate: 31, state: 'open' }, names)).toEqual({
        what: { key: 'gate.event.garageOpened' },
        gate: 'Left',
      });
      expect(
        eventLine({ kind: 'garage', gate: 31, state: 'closed', openForSeconds: 1_140 }, names),
      ).toEqual({
        what: { key: 'gate.event.garageClosed' },
        gate: 'Left',
        lasted: { key: 'gate.duration.minutes', params: { minutes: 19 } },
      });
    });

    it('prints a kind it does not know as it came', () => {
      expect(eventLine({ kind: 'tamper' }, names)).toEqual({ what: { literal: 'tamper' } });
    });
  });
});
