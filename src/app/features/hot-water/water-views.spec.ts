import { ApiError } from '../../core/api/api-error';
import { WATER_ERROR_TEXTS, describeCirculationError, describeWaterError } from './water-errors';
import {
  bucketLabel,
  bucketStarts,
  bucketValues,
  changePercent,
  hasNextPeriod,
  hasValveReading,
  isValveOutOfDate,
  periodLabel,
  periodStart,
  shiftPeriod,
  toValveView,
  unitOf,
  volumeIn,
} from './water-views';

const ZONE = 'Europe/Warsaw';

// The valve and the consumption as the water page reads them (HAS-322)
describe('water views', () => {
  describe('the valve', () => {
    it('reads what the answer holds and leaves out what it does not', () => {
      expect(
        toValveView({ state: 'closed', flowRate: 0, counter: { total: 61.896 } }, ZONE),
      ).toEqual({
        open: false,
        flowRate: 0,
        pressure: undefined,
        temperature: undefined,
        counter: 61.896,
        measuredAt: undefined,
        measuredInstant: undefined,
      });
    });

    // nothing checks an answer at runtime: a state it does not know is not known, never closed
    it('never reads a state or a number it does not know', () => {
      const view = toValveView(
        { state: 'half', flowRate: 'a lot' as unknown as number, measuredAt: 'yesterday' },
        ZONE,
      );

      expect(view.open).toBeUndefined();
      expect(view.flowRate).toBeUndefined();
      expect(view.measuredInstant).toBeUndefined();
      expect(hasValveReading(view)).toBe(false);
      expect(hasValveReading(toValveView(null, ZONE))).toBe(false);
    });

    it('is out of date once its newest report is older than 3 minutes, never without a time', () => {
      const view = toValveView({ state: 'open', measuredAt: '2026-11-05T18:00:00' }, ZONE);
      const at = view.measuredInstant!;

      expect(isValveOutOfDate(view, at + 3 * 60_000)).toBe(false);
      expect(isValveOutOfDate(view, at + 3 * 60_000 + 1)).toBe(true);
      expect(isValveOutOfDate(toValveView({ state: 'open' }, ZONE), at + 3_600_000)).toBe(false);
    });
  });

  describe('the consumption', () => {
    it('shows litres where a bucket is an hour or a day, m³ for a year', () => {
      expect(unitOf('day').unit).toBe('L');
      expect(unitOf('month').unit).toBe('L');
      expect(unitOf('year')).toEqual({ unit: 'm³', factor: 1, decimals: 1 });
      expect(volumeIn('day', 0.123)).toBe(123);
      expect(volumeIn('year', 10.256)).toBe(10.3);
      expect(volumeIn('week', undefined)).toBeUndefined();
    });

    it('cuts a day in hours, a week and a month in days, a year in months', () => {
      expect(bucketStarts('day', '2026-11-05T00:00:00', '2026-11-06T00:00:00')).toHaveLength(24);
      expect(bucketStarts('week', '2026-11-02T00:00:00', '2026-11-09T00:00:00')).toHaveLength(7);
      expect(bucketStarts('month', '2026-02-01T00:00:00', '2026-03-01T00:00:00')).toHaveLength(28);
      const months = bucketStarts('year', '2026-01-01T00:00:00', '2027-01-01T00:00:00');
      expect(months).toHaveLength(12);
      expect(months[11]).toBe('2026-12-01T00:00:00');
    });

    // the day the clocks go back is a day of 24 buckets on the wall clock - its repeated hour is one bucket
    it('counts a day of the change of the clocks in 24 hours of the wall clock', () => {
      expect(bucketStarts('day', '2026-10-25T00:00:00', '2026-10-26T00:00:00')).toHaveLength(24);
    });

    // a bucket the service did not watch has no bar - never 0; a bucket without water is 0
    it('gives no value to a bucket the answer has no point for', () => {
      const starts = bucketStarts('day', '2026-11-05T00:00:00', '2026-11-05T03:00:00');

      expect(
        bucketValues('day', starts, {
          buckets: [
            { at: '2026-11-05T00:00:00', volume: 0 },
            { at: '2026-11-05T02:00:00.000', volume: 0.045 },
            { at: '2026-11-05T01:00:00', volume: 'much' as unknown as number },
          ],
        }),
      ).toEqual([0, null, 45]);
      expect(bucketValues('day', starts, null)).toEqual([null, null, null]);
    });

    it('names a bucket by its hour, weekday, day or month', () => {
      expect(bucketLabel('day', '2026-11-05T07:00:00', 'en-GB')).toBe('07:00');
      expect(bucketLabel('week', '2026-11-02T00:00:00', 'en-GB')).toBe('Mon 2');
      expect(bucketLabel('month', '2026-11-12T00:00:00', 'pl-PL')).toBe('12');
      expect(bucketLabel('year', '2026-03-01T00:00:00', 'en-GB')).toBe('Mar');
    });

    // a week of the service runs Monday to Sunday
    it('finds the first day of a range and steps a range back and forth', () => {
      expect(periodStart('week', '2026-11-08')).toBe('2026-11-02');
      expect(periodStart('week', '2026-11-02')).toBe('2026-11-02');
      expect(periodStart('month', '2026-11-30')).toBe('2026-11-01');
      expect(periodStart('year', '2026-11-30')).toBe('2026-01-01');
      expect(shiftPeriod('day', '2026-03-01', -1)).toBe('2026-02-28');
      expect(shiftPeriod('week', '2026-11-05', -1)).toBe('2026-10-26');
      expect(shiftPeriod('month', '2026-01-31', -1)).toBe('2025-12-01');
      expect(shiftPeriod('year', '2026-11-05', 1)).toBe('2027-01-01');
    });

    it('offers the range after only once it has begun', () => {
      expect(hasNextPeriod('day', '2026-11-05', '2026-11-05')).toBe(false);
      expect(hasNextPeriod('day', '2026-11-04', '2026-11-05')).toBe(true);
      expect(hasNextPeriod('week', '2026-10-30', '2026-11-05')).toBe(true);
      expect(hasNextPeriod('month', '2026-11-01', '2026-11-30')).toBe(false);
    });

    it('names the range of a day', () => {
      expect(periodLabel('day', '2026-11-05', 'en-GB')).toBe('5 November 2026');
      expect(periodLabel('month', '2026-11-05', 'en-GB')).toBe('November 2026');
      expect(periodLabel('year', '2026-11-05', 'en-GB')).toBe('2026');
      expect(periodLabel('week', '2026-11-05', 'en-GB')).toContain('2');
    });

    it('compares a total with the one before, never against nothing', () => {
      expect(changePercent(0.11, 0.1)).toBe(10);
      expect(changePercent(0.09, 0.1)).toBe(-10);
      expect(changePercent(0.1, 0)).toBeUndefined();
      expect(changePercent(undefined, 0.1)).toBeUndefined();
    });
  });

  // the codes of water-service the page words - a new or renamed code needs a text here
  describe('the refusals of water-service', () => {
    it('words every code it knows, and anything else as usual', () => {
      expect(Object.keys(WATER_ERROR_TEXTS)).toEqual([
        'NOT_FOUND_VALVE',
        'REGISTRY_UNAVAILABLE',
        'INVALID_RANGE',
        'INVALID_BILL',
        'NOT_FOUND_BILL',
        'INVALID_COMMAND',
        'DEVICE_FAILED',
        'TANK_COLD',
        'SOFTENER_UNAVAILABLE',
        'SOFTENER_COMMAND_FAILED',
        'REGENERATION_IN_PROGRESS',
        'COMMAND_TOO_SOON',
        'LIVE_THROTTLED',
      ]);
      expect(
        describeWaterError(
          new ApiError('client', 404, [{ message: 'No water valve', code: 'NOT_FOUND_VALVE' }]),
        ),
      ).toEqual({ key: 'water.error.valveNotFound' });
      expect(describeWaterError(new ApiError('server', 502))).not.toEqual({
        key: 'water.error.valveNotFound',
      });
    });

    // DEVICE_FAILED is shared with the valve in water-service: a start of the pump names the pump
    it('names the pump for a start of the circulation that failed', () => {
      const failed = new ApiError('server', 502, [
        { message: 'Device failed', code: 'DEVICE_FAILED' },
      ]);
      expect(describeCirculationError(failed)).toEqual({
        key: 'hotWater.circulation.deviceFailed',
      });
      expect(describeWaterError(failed)).toEqual({ key: 'water.error.deviceFailed' });
      expect(
        describeCirculationError(
          new ApiError('client', 409, [{ message: 'Tank too cold', code: 'TANK_COLD' }]),
        ),
      ).toEqual({ key: 'water.error.tankCold' });
    });
  });
});
