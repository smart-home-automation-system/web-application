import {
  cssColorOf,
  houseText,
  lightSourceText,
  occupancyOf,
  runErrorText,
  runReasonText,
  sensorKindText,
  stateOf,
} from './light-labels';

// HAS-266: the words of the values of light-service - a value this version does not know is the service's own word
describe('light labels', () => {
  it('names a source it knows, and prints one it does not as it came', () => {
    expect(lightSourceText('rule')).toEqual({ key: 'lights.source.rule' });
    expect(lightSourceText('empty-house')).toEqual({ key: 'lights.source.emptyHouse' });
    // the word of a Shelly device
    expect(lightSourceText('HTTP_in')).toEqual({ literal: 'HTTP_in' });
    expect(lightSourceText(undefined)).toEqual({ key: 'lights.source.unknown' });
    // a key of the object itself is no word of the service
    expect(lightSourceText('constructor')).toEqual({ literal: 'constructor' });
  });

  it('names the reasons of the engine and the codes of a light that did not take a command', () => {
    expect(runReasonText('presence-simulation')).toEqual({
      key: 'lights.reason.presenceSimulation',
    });
    expect(runReasonText('something-new')).toEqual({ literal: 'something-new' });
    expect(runErrorText('DEVICE_FAILED')).toEqual({ key: 'lights.error.deviceFailed' });
    expect(runErrorText('A_NEW_CODE')).toEqual({ literal: 'A_NEW_CODE' });
  });

  it('reads a light and a room as not known where the service says nothing - never off or empty', () => {
    expect(stateOf({ on: true })).toBe('on');
    expect(stateOf({ on: false })).toBe('off');
    expect(stateOf({})).toBe('unknown');
    expect(stateOf(undefined)).toBe('unknown');
    expect(occupancyOf({ occupied: false })).toBe('empty');
    expect(occupancyOf({ lastMotionAt: '2026-10-20T09:00:00' })).toBe('unknown');
    expect(houseText('vacation')).toEqual({ literal: 'vacation' });
    expect(houseText(undefined)).toEqual({ key: 'lights.emptyHouse.house.unknown' });
    expect(sensorKindText('motion sensor')).toEqual({ key: 'devices.kind.motionSensor' });
  });

  it('draws a colour only from three bytes', () => {
    expect(cssColorOf([255, 140, 0])).toBe('rgb(255, 140, 0)');
    expect(cssColorOf([255, 140])).toBeUndefined();
    expect(cssColorOf([256, 0, 0])).toBeUndefined();
    expect(cssColorOf([1.5, 0, 0])).toBeUndefined();
    expect(cssColorOf(undefined)).toBeUndefined();
  });
});
