import { isOutOfDate, toWaterReading } from './water-reading';

const WARSAW = 'Europe/Warsaw';
// 18:30 in the house (summer time, UTC+2)
const NOW = Date.parse('2026-10-10T16:30:00Z');

describe('toWaterReading', () => {
  it('reads both temperatures and the time the sensors were read', () => {
    const reading = toWaterReading(
      {
        measuredAt: '2026-10-10T18:28:50',
        water: { temperature: 46.81 },
        circulation: { temperature: 26.44, pumpActive: false },
      },
      WARSAW,
    );

    expect(reading).toEqual({
      tank: 46.81,
      circulation: 26.44,
      measuredAt: '2026-10-10T18:28:50',
      measuredInstant: Date.parse('2026-10-10T16:28:50Z'),
    });
  });

  // before its first reading the service answers 200 with no body at all
  it('reads an answer without a body as nothing measured', () => {
    for (const answer of [null, undefined, {}]) {
      expect(toWaterReading(answer, WARSAW)).toEqual({
        tank: undefined,
        circulation: undefined,
        measuredAt: undefined,
        measuredInstant: undefined,
      });
    }
  });

  it('reads a temperature of zero as a reading, and anything that is no number as none', () => {
    expect(toWaterReading({ water: { temperature: 0 } }, WARSAW).tank).toBe(0);
    expect(
      toWaterReading({ water: { temperature: 'warm' as unknown as number } }, WARSAW).tank,
    ).toBeUndefined();
    expect(toWaterReading({ water: { temperature: Number.NaN } }, WARSAW).tank).toBeUndefined();
  });

  // an older water-service sends no time; one that is no date-time is not made up either
  it('has no time for an answer that does not date its reading', () => {
    expect(toWaterReading({ water: { temperature: 46 } }, WARSAW).measuredAt).toBeUndefined();
    expect(
      toWaterReading({ measuredAt: 'a moment ago', water: { temperature: 46 } }, WARSAW)
        .measuredInstant,
    ).toBeUndefined();
  });
});

describe('isOutOfDate', () => {
  const measured = (dateTime: string) => toWaterReading({ measuredAt: dateTime }, WARSAW);

  // the service reads the sensors every 3 minutes: two missed polls
  it('is true once the reading is older than 6 minutes', () => {
    expect(isOutOfDate(measured('2026-10-10T18:23:59'), NOW)).toBe(true);
    expect(isOutOfDate(measured('2026-10-10T18:24:00'), NOW)).toBe(false);
    expect(isOutOfDate(measured('2026-10-10T18:29:00'), NOW)).toBe(false);
  });

  it('is never true for a reading without its time', () => {
    expect(isOutOfDate(toWaterReading({ water: { temperature: 46 } }, WARSAW), NOW)).toBe(false);
  });
});
