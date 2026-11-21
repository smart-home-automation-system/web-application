import { ApiError } from '../../core/api/api-error';
import { Detector } from '../../data-access/safety/safety-api';
import {
  SAFETY_ERROR_TEXTS,
  baseViews,
  canMute,
  commandFailureOf,
  describeSafetyError,
  detectorKindText,
  detectorStateOf,
  detectorsByFloor,
  detectorsInAlarm,
  detectorsOfRoom,
  flagOf,
  reactionText,
  silentBases,
  summariseSafety,
} from './safety-labels';

const SINCE = '2026-11-20T10:00:00';
const on = { value: true, since: SINCE };
const off = { value: false, since: SINCE };

/** A detector the base says everything of, all right. */
const fine = (id: number, room: string, name = `Detector ${id}`): Detector => ({
  id,
  name,
  room,
  kind: 'smoke detector',
  alarm: off,
  online: on,
  muted: off,
  batteryLow: off,
  endOfLife: off,
  fault: off,
  selfTestProblem: off,
});

const refusal = (code: string) =>
  new ApiError('client', 409, [{ message: 'Something the service said', code }]);

describe('the safety labels', () => {
  // HAS-464: the base does nothing with a mute of a quiet detector; a muted one is not offered it again
  it('offers a mute only of a detector in alarm and not muted already', () => {
    expect(canMute({ ...fine(1, 'kitchen'), alarm: on })).toBe(true);
    expect(canMute({ ...fine(1, 'kitchen'), alarm: on, muted: undefined })).toBe(true);
    expect(canMute({ ...fine(1, 'kitchen'), alarm: on, muted: on })).toBe(false);
    expect(canMute(fine(1, 'kitchen'))).toBe(false);
    expect(canMute({ ...fine(1, 'kitchen'), alarm: undefined })).toBe(false);
    expect(canMute({ ...fine(1, 'kitchen'), alarm: { since: SINCE } })).toBe(false);
  });

  // the refusals of safety-service - a new code needs a text, and this list is where it is noticed
  it('word every code of the service', () => {
    expect(Object.keys(SAFETY_ERROR_TEXTS)).toEqual([
      'NOT_FOUND_DETECTOR',
      'COMMAND_TOO_SOON',
      'INVALID_AUTOMATION',
      'REGISTRY_UNAVAILABLE',
      'NOT_FOUND_ROOM',
      'INVALID_RANGE',
      'COMMAND_NOT_SENT',
      'NOTHING_TO_MUTE',
    ]);
    for (const [code, key] of Object.entries(SAFETY_ERROR_TEXTS)) {
      expect(describeSafetyError(refusal(code))).toEqual({ key });
    }
  });

  it('tell a refusal without a code as the service worded it', () => {
    expect(describeSafetyError(new ApiError('client', 400, [{ message: 'source' }]))).toEqual({
      literal: 'source',
    });
  });

  it('say that a command without an answer may have been carried out', () => {
    expect(commandFailureOf({ sending: false, error: new ApiError('network', 0) })).toEqual({
      key: 'safety.commandFailed',
    });
    expect(commandFailureOf({ sending: false, error: refusal('COMMAND_TOO_SOON') })).toEqual({
      key: 'safety.error.commandTooSoon',
    });
  });

  // missing is never off
  it('read a flag left out - whole or its value - as not known', () => {
    expect(flagOf(on)).toBe('yes');
    expect(flagOf(off)).toBe('no');
    expect(flagOf(undefined)).toBe('unknown');
    expect(flagOf({ since: SINCE })).toBe('unknown');
  });

  describe('the state of a detector', () => {
    it('is the alarm first, then the mute, then off the base', () => {
      expect(detectorStateOf({ ...fine(1, 'kitchen'), alarm: on, muted: on, online: off })).toBe(
        'alarm',
      );
      expect(detectorStateOf({ ...fine(1, 'kitchen'), muted: on, online: off })).toBe('muted');
      expect(detectorStateOf({ ...fine(1, 'kitchen'), online: off })).toBe('offline');
      expect(detectorStateOf(fine(1, 'kitchen'))).toBe('ok');
    });

    it('is not known while the answer leaves out the alarm, the base or the mute', () => {
      for (const left of ['alarm', 'online', 'muted'] as const) {
        const detector: Detector = { ...fine(1, 'kitchen'), [left]: undefined };
        expect(detectorStateOf(detector), left).toBe('unknown');
      }
      expect(detectorStateOf({ id: 1 })).toBe('unknown');
    });
  });

  it('word a kind this version does not know as it came', () => {
    expect(detectorKindText('co detector')).toEqual({ key: 'safety.kind.co' });
    expect(detectorKindText('flood detector')).toEqual({ literal: 'flood detector' });
    expect(detectorKindText(undefined)).toEqual({ key: 'safety.kind.unknown' });
  });

  it('find the detectors in alarm, and none in an answer without a list', () => {
    const read = {
      detectors: [fine(1, 'kitchen'), { ...fine(2, 'office'), alarm: on }, { alarm: on }],
    };

    expect(detectorsInAlarm(read).map((detector) => detector.id)).toEqual([2]);
    expect(detectorsInAlarm(null)).toEqual([]);
    expect(detectorsInAlarm(undefined)).toEqual([]);
  });

  it('give the detectors of one room by name, and nothing before an answer', () => {
    const read = {
      detectors: [fine(2, 'office', 'Window'), fine(1, 'office', 'Door'), fine(3, 'kitchen')],
    };

    expect(detectorsOfRoom(read, 'office')?.map((detector) => detector.name)).toEqual([
      'Door',
      'Window',
    ]);
    expect(detectorsOfRoom(read, 'loft')).toEqual([]);
    expect(detectorsOfRoom(undefined, 'office')).toBeUndefined();
  });

  describe('the summary of the house', () => {
    it('is the alarm first, with the names', () => {
      const summary = summariseSafety({
        detectors: [
          { ...fine(1, 'kitchen', 'Kitchen'), alarm: on },
          { ...fine(2, 'loft', 'Loft'), batteryLow: on },
        ],
      });

      expect(summary).toEqual({
        state: 'alarm',
        total: 2,
        inAlarm: 'Kitchen',
        inTrouble: 'Loft',
        unknown: 0,
      });
    });

    it('is a detector in trouble: off the base, a low battery, its end of life, a fault', () => {
      for (const trouble of [
        { online: off },
        { batteryLow: on },
        { endOfLife: on },
        { fault: on },
      ]) {
        expect(summariseSafety({ detectors: [{ ...fine(1, 'kitchen'), ...trouble }] })?.state).toBe(
          'trouble',
        );
      }
    });

    it('is not known while the answer says too little of a detector', () => {
      const summary = summariseSafety({
        detectors: [fine(1, 'kitchen'), { ...fine(2, 'office'), batteryLow: undefined }],
      });

      expect(summary?.state).toBe('unknown');
      expect(summary?.unknown).toBe(1);
    });

    it('is all right only when the answer says so of everything', () => {
      expect(summariseSafety({ detectors: [fine(1, 'kitchen')] })?.state).toBe('ok');
      expect(summariseSafety({ detectors: [] })?.total).toBe(0);
      expect(summariseSafety(undefined)).toBeUndefined();
    });
  });

  it('put the detectors by floor in the order of the house, an unknown room last', () => {
    const floors = detectorsByFloor([
      fine(1, 'loft'),
      fine(2, 'kitchen'),
      fine(3, 'office'),
      fine(4, 'greenhouse'),
      { ...fine(5, 'kitchen'), room: undefined },
    ]);

    expect(floors.map((floor) => [floor.id, floor.rooms.map((room) => room.room)])).toEqual([
      ['ground', ['kitchen']],
      ['upper', ['office']],
      ['attic', ['loft']],
      ['other', ['', 'greenhouse']],
    ]);
  });

  it('join a base of the monitor with the network the detectors call names', () => {
    const views = baseViews(
      [{ stationSerial: 'SBS50ABCDEF01', reachable: true, wifiRssi: -60, silent: false }],
      [
        { stationSerial: 'SBS50ABCDEF01', wifiSsid: 'house', wifiRssi: -70 },
        { stationSerial: 'SBS50ABCDEF02', online: off, wifiSsid: 'garage' },
      ],
    );

    expect(views).toEqual([
      {
        stationSerial: 'SBS50ABCDEF01',
        reachable: true,
        wifiRssi: -60,
        silent: false,
        wifiSsid: 'house',
      },
      { stationSerial: 'SBS50ABCDEF02', reachable: false, wifiSsid: 'garage' },
    ]);
    expect(baseViews(undefined, [])).toBeUndefined();
  });

  it('name the silent bases alone', () => {
    expect(
      silentBases([
        { stationSerial: 'SBS50ABCDEF01', silent: true },
        { stationSerial: 'SBS50ABCDEF02', silent: false },
        { stationSerial: 'SBS50ABCDEF03' },
      ]),
    ).toEqual(['SBS50ABCDEF01']);
    expect(silentBases(null)).toEqual([]);
  });

  it('word a reaction, or print one this version does not know', () => {
    expect(reactionText('blindsUp')).toEqual({ key: 'safety.automation.blindsUp' });
    expect(reactionText('doorsOpen')).toEqual({ literal: 'doorsOpen' });
  });
});
