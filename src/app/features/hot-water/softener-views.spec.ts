import { SOFTENER_OUT_OF_DATE_MS } from '../../data-access/water/softener-api';
import {
  alertLevelOf,
  hasSoftenerReading,
  isSoftenerOutOfDate,
  regenerationMarks,
  saltLevelOf,
  toSoftenerView,
} from './softener-views';

const ZONE = 'Europe/Warsaw';

describe('softener views', () => {
  // the answer of the real softener read on 2026-11-09, in the shape of water-service 0.19.0
  const REAL = {
    reachable: true,
    online: true,
    measuredAt: '2026-11-09T10:00:00',
    stale: false,
    water: { usedTodayLitres: 102, averageDailyLitres: 503, treatedAvailableLitres: 2218, flowLitresPerMinute: 0 },
    salt: { levelPercent: 25, daysLeft: 73, outOfSaltDate: '2027-01-21' },
    regeneration: { daysSinceLast: 0, lastAt: '2026-11-09', total: 156, status: 'none' },
    hardnessGpg: 12,
    hardnessMgCaco3: 205.4,
    alerts: { lowSalt: false, leak: false, excessiveWaterUse: false, shutoffValve: false, resin: false, error: false },
    live: false,
  };

  it('reads the answer of the softener', () => {
    const view = toSoftenerView(REAL, ZONE);

    expect(view.saltPercent).toBe(25);
    expect(view.saltDaysLeft).toBe(73);
    expect(view.outOfSaltDate).toBe('2027-01-21');
    expect(view.hardnessMgCaco3).toBe(205.4);
    expect(view.regeneration).toBe('none');
    expect(view.flags.map((flag) => [flag.flag, flag.raised])).toEqual([
      ['lowSalt', false],
      ['leak', false],
      ['excessiveWaterUse', false],
      ['shutoffValve', false],
      ['resin', false],
      ['error', false],
    ]);
    expect(hasSoftenerReading(view)).toBe(true);
  });

  // missing is never off, never zero
  it('leaves a field the answer leaves out not known - a flag never clear', () => {
    const view = toSoftenerView({ salt: { levelPercent: 40 }, alerts: { leak: true } }, ZONE);

    expect(view.saltDaysLeft).toBeUndefined();
    expect(view.usedTodayLitres).toBeUndefined();
    expect(view.online).toBeUndefined();
    expect(view.regeneration).toBeUndefined();
    expect(view.flags.find((flag) => flag.flag === 'leak')?.raised).toBe(true);
    expect(view.flags.find((flag) => flag.flag === 'lowSalt')?.raised).toBeUndefined();
  });

  it('takes what is not a number, a boolean or a date for not known', () => {
    const view = toSoftenerView(
      {
        salt: { levelPercent: '25' as unknown as number, outOfSaltDate: 'soon' },
        alerts: { resin: 1 as unknown as boolean },
        measuredAt: 'yesterday',
      },
      ZONE,
    );

    expect(view.saltPercent).toBeUndefined();
    expect(view.outOfSaltDate).toBeUndefined();
    expect(view.flags.find((flag) => flag.flag === 'resin')?.raised).toBeUndefined();
    expect(view.measuredAt).toBeUndefined();
    expect(hasSoftenerReading(view)).toBe(false);
  });

  // the words of the cloud: none and scheduled as seen, a word this version does not know kept as it came
  it('reads the words of the cloud for the regeneration', () => {
    const state = (status: string) => toSoftenerView({ regeneration: { status } }, ZONE);

    expect(state('scheduled').regeneration).toBe('scheduled');
    expect(state('regenerating').regeneration).toBe('running');
    expect(state('backwash').regeneration).toBe('other');
    expect(state('backwash').regenerationWords).toBe('backwash');
  });

  it('calls a reading out of date past two reads of the service, or when the service says so', () => {
    const view = toSoftenerView(REAL, ZONE);
    const read = view.measuredInstant!;

    expect(isSoftenerOutOfDate(view, read + SOFTENER_OUT_OF_DATE_MS)).toBe(false);
    expect(isSoftenerOutOfDate(view, read + SOFTENER_OUT_OF_DATE_MS + 1)).toBe(true);
    expect(isSoftenerOutOfDate(toSoftenerView({ ...REAL, stale: true }, ZONE), read)).toBe(true);
    // never out of date without a time
    expect(isSoftenerOutOfDate(toSoftenerView({ salt: { levelPercent: 1 } }, ZONE), read * 2)).toBe(false);
  });

  it('reads the salt as out, low or fine', () => {
    expect(saltLevelOf(undefined)).toBeUndefined();
    expect(saltLevelOf(0)).toBe('out');
    expect(saltLevelOf(19)).toBe('low');
    expect(saltLevelOf(20)).toBe('ok');
  });

  it('colours an alert of the cloud by its level, a word it does not know plain', () => {
    expect(alertLevelOf({ level: 'critical' })).toBe('critical');
    expect(alertLevelOf({ level: 'Warning' })).toBe('warning');
    expect(alertLevelOf({ level: 'info' })).toBe('info');
    expect(alertLevelOf({ level: 'loud' })).toBe('info');
    expect(alertLevelOf({})).toBe('info');
  });

  // the salt in amber, apart from a fault (owner, 2026-11-09) - whatever level the cloud gives it
  it('tells the salt alert apart by its type', () => {
    expect(alertLevelOf({ type: 'low_salt', level: 'warning' })).toBe('salt');
    expect(alertLevelOf({ type: 'Salt', level: 'critical' })).toBe('salt');
  });

  it('marks the start of every regeneration on the wall clock, a start it cannot read left out', () => {
    expect(
      regenerationMarks([
        { startedAt: '2026-11-09T02:01:51', endedAt: '2026-11-09T04:03:46' },
        { startedAt: 'soon' },
        {},
      ]),
    ).toEqual([Date.UTC(2026, 10, 9, 2, 1, 51)]);
    expect(regenerationMarks(null)).toEqual([]);
  });
});
