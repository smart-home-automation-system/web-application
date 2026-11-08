import { ApiError } from '../../core/api/api-error';
import {
  AIRCON_ERROR_TEXTS,
  airconFailureOf,
  airconStateOf,
  describeAirconError,
  modeText,
} from './aircon-labels';

describe('the words of the air conditioners', () => {
  // the codes of AirconError of aircon-service a card meets - a new one needs a text here
  it('has a text for every code of a command and a read', () => {
    expect(Object.keys(AIRCON_ERROR_TEXTS)).toEqual([
      'NOT_FOUND_AIRCON',
      'INVALID_COMMAND',
      'DEVICE_FAILED',
      'REGISTRY_UNAVAILABLE',
      'INVALID_RULE',
      'NOT_FOUND_RULE',
      'AIRCON_RUNNING',
      'POWER_CYCLE_IN_PROGRESS',
      'INVALID_RANGE',
      'NOT_FOUND_PLUG',
    ]);
  });

  it('words a refusal by its code, and anything else as every failed call', () => {
    expect(
      describeAirconError(
        new ApiError('client', 400, [
          { message: 'Cooling never goes below 22 C', code: 'INVALID_COMMAND' },
        ]),
      ),
    ).toEqual({ key: 'aircon.error.invalidCommand' });
    expect(describeAirconError(new ApiError('server', 500, [{ message: 'boom' }]))).not.toEqual({
      key: 'aircon.error.invalidCommand',
    });
  });

  it('says a command without an answer may have been carried out', () => {
    expect(airconFailureOf({ sending: false, error: new ApiError('network', 0, []) })).toEqual({
      key: 'aircon.commandFailed',
    });
  });

  // missing is never off
  it('reads a unit without its power as not known', () => {
    expect(airconStateOf({ id: 1 })).toBe('unknown');
    expect(airconStateOf({ id: 1, power: false })).toBe('off');
    expect(airconStateOf({ id: 1, power: true })).toBe('on');
  });

  it('prints a mode this version does not know as it came', () => {
    expect(modeText('cool')).toEqual({ key: 'aircon.mode.cool' });
    expect(modeText('smart')).toEqual({ literal: 'smart' });
  });
});
