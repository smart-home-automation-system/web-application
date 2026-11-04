import { EnergyForecast } from '../../data-access/energy/energy-api';
import {
  categoryLabel,
  forecastDays,
  forecastPast,
  heightOf,
  outlookOf,
  scaleOf,
  tomorrowOf,
} from './energy-forecast-views';

// Wednesday 4 November 2026
const WEEK = [
  '2026-11-04',
  '2026-11-05',
  '2026-11-06',
  '2026-11-07',
  '2026-11-08',
  '2026-11-09',
  '2026-11-10',
];

function forecast(
  categories: readonly (string | undefined)[],
  outlook?: EnergyForecast['outlook'],
): EnergyForecast {
  return {
    stale: false,
    days: WEEK.map((day, index) => ({
      day,
      totalKwh: 5 + index * 4,
      coverage: (5 + index * 4) / 25,
      category: categories[index],
    })),
    outlook,
  };
}

describe('the forecast of the energy page', () => {
  describe('the days', () => {
    it('reads a day of the answer, the share of the house load in %, the days from the fourth on paler', () => {
      const days = forecastDays({
        days: [
          {
            day: '2026-11-04',
            solaxKwh: 4.3,
            sofarKwh: 2.5,
            totalKwh: 6.8,
            coverage: 0.277,
            category: 'poor',
          },
          { day: '2026-11-05' },
          { day: '2026-11-06' },
          { day: '2026-11-07', category: 'cloudy' },
        ],
      });

      expect(days[0]).toEqual({
        day: '2026-11-04',
        solax: 4.3,
        sofar: 2.5,
        total: 6.8,
        share: 28,
        category: 'poor',
        otherCategory: undefined,
        cloudCover: undefined,
        sunshineHours: undefined,
        pale: false,
      });
      // a day the answer says nothing of is not known, never 0
      expect(days[1].total).toBeUndefined();
      expect(days[1].share).toBeUndefined();
      expect(days.map((day) => day.pale)).toEqual([false, false, false, true]);
      // a category this version does not know is printed as it came
      expect(days[3].category).toBeUndefined();
      expect(days[3].otherCategory).toBe('cloudy');
    });

    it('has no day without a list, and none without its date', () => {
      expect(forecastDays(null)).toEqual([]);
      expect(forecastDays({ stale: true })).toEqual([]);
      expect(forecastDays({ days: [{ totalKwh: 3 }] })).toEqual([]);
    });

    it('words the four categories of the service and no other', () => {
      expect(categoryLabel('none')).toBe('energy.forecast.category.none');
      expect(categoryLabel('good')).toBe('energy.forecast.category.good');
      expect(categoryLabel('cloudy')).toBeUndefined();
      expect(categoryLabel(undefined)).toBeUndefined();
    });
  });

  describe('the closed days', () => {
    it('sums both inverters, only when both are known', () => {
      expect(
        forecastPast({
          past: [
            {
              day: '2026-11-03',
              solax: { forecastKwh: 6.2, actualKwh: 5.4 },
              sofar: { forecastKwh: 3.8, actualKwh: 3.1 },
            },
            { day: '2026-11-02', solax: { forecastKwh: 6.2, actualKwh: 5.4 } },
          ],
        }),
      ).toEqual([
        { day: '2026-11-03', forecast: 10, actual: 8.5, actualSolax: 5.4, actualSofar: 3.1 },
        {
          day: '2026-11-02',
          forecast: undefined,
          actual: undefined,
          actualSolax: 5.4,
          actualSofar: undefined,
        },
      ]);
    });
  });

  describe('the height of a bar', () => {
    it('is measured against the largest amount of the card, the house load included', () => {
      const days = forecastDays(forecast([]));
      expect(scaleOf(days, [], 40)).toBe(40);
      expect(scaleOf(days, [], 10)).toBe(29);
      expect(heightOf(14.5, 29)).toBe(50);
      expect(heightOf(undefined, 29)).toBe(0);
      expect(heightOf(5, undefined)).toBe(0);
    });

    it('has no scale while nothing is known', () => {
      expect(scaleOf([], [], undefined)).toBeUndefined();
    });
  });

  describe('the sentence of the coming days', () => {
    it('says the sun comes back on a weekday, with its kWh and its share of the house load', () => {
      expect(
        outlookOf(
          forecast(['poor', 'none', 'poor', 'fair', 'good', 'good', 'poor'], {
            sunBackOn: '2026-11-07',
            daysWithoutSun: 3,
          }),
        ),
      ).toEqual({
        kind: 'back',
        days: 3,
        on: 'energy.forecast.on.saturday',
        kwh: 17,
        share: 68,
      });
    });

    it('says tomorrow when the sun comes back after one day', () => {
      expect(
        outlookOf(forecast(['poor', 'good'], { sunBackOn: '2026-11-05', daysWithoutSun: 1 })),
      ).toMatchObject({ kind: 'back', days: 1, on: 'tomorrow', kwh: 9, share: 36 });
    });

    it('says today, and whether tomorrow is good too', () => {
      expect(
        outlookOf(forecast(['good', 'fair'], { sunBackOn: '2026-11-04', daysWithoutSun: 0 })),
      ).toEqual({ kind: 'today', tomorrow: true });
      expect(
        outlookOf(forecast(['good', 'poor'], { sunBackOn: '2026-11-04', daysWithoutSun: 0 })),
      ).toEqual({ kind: 'today', tomorrow: false });
    });

    it('says there is no sun this week', () => {
      expect(
        outlookOf(
          forecast(['poor', 'none', 'poor', 'none', 'poor', 'none', 'poor'], { daysWithoutSun: 7 }),
        ),
      ).toEqual({ kind: 'noSun', days: 7 });
    });

    it('judges nothing without a category - the service had no house load', () => {
      expect(outlookOf(forecast([]))).toEqual({ kind: 'unknown' });
      expect(outlookOf(forecast(['poor']))).toEqual({ kind: 'unknown' });
      expect(outlookOf(null)).toEqual({ kind: 'unknown' });
    });
  });

  describe('tomorrow on the overview', () => {
    it('says its word and kWh, the kWh alone, or that it is not known', () => {
      expect(tomorrowOf(forecast(['poor', 'fair']))).toEqual({
        kind: 'both',
        word: 'energy.forecast.inline.fair',
        kwh: 9,
      });
      expect(tomorrowOf(forecast([]))).toEqual({ kind: 'kwh', kwh: 9 });
      expect(
        tomorrowOf({ days: [{ day: '2026-11-04' }, { day: '2026-11-05', category: 'good' }] }),
      ).toEqual({
        kind: 'unknown',
      });
      expect(tomorrowOf(undefined)).toEqual({ kind: 'unknown' });
    });
  });
});
