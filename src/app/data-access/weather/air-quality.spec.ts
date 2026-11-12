import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';

import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import {
  AIR_LEVEL_LABELS,
  AirLevel,
  PM10_BAD_FROM,
  PM10_MODERATE_FROM,
  PM10_THRESHOLDS,
  PM25_THRESHOLDS,
  airLevelColour,
  airLevelOf,
  levelOfPm10,
  levelOfPm25,
} from './air-quality';

// the hourly index of GIOS, the numbers notification-service words the smog by (HAS-430)
describe('air quality', () => {
  it('pins the thresholds of the index', () => {
    expect(PM10_THRESHOLDS).toEqual([20, 50, 80, 110, 150]);
    expect(PM25_THRESHOLDS).toEqual([13, 35, 55, 75, 110]);
    expect(PM10_MODERATE_FROM).toBe(50);
    expect(PM10_BAD_FROM).toBe(110);
  });

  // a threshold belongs to the level below it
  it.each([
    [0, 1],
    [20, 1],
    [21, 2],
    [50, 2],
    [50.5, 3],
    [80, 3],
    [81, 4],
    [110, 4],
    [111, 5],
    [150, 5],
    [151, 6],
    [400, 6],
  ])('PM10 %s is level %s', (value, level) => {
    expect(levelOfPm10(value)).toBe(level);
  });

  it.each([
    [0, 1],
    [13, 1],
    [14, 2],
    [35, 2],
    [36, 3],
    [55, 3],
    [56, 4],
    [75, 4],
    [76, 5],
    [110, 5],
    [111, 6],
  ])('PM2.5 %s is level %s', (value, level) => {
    expect(levelOfPm25(value)).toBe(level);
  });

  it.each([undefined, null, -1, Number.NaN, Number.POSITIVE_INFINITY, '50'])(
    'gives no level for %s, which is no concentration',
    (value) => {
      expect(levelOfPm10(value)).toBeUndefined();
      expect(levelOfPm25(value)).toBeUndefined();
    },
  );

  it('reads the level of the service as a whole number from 1 to 6, nothing else', () => {
    expect([1, 2, 3, 4, 5, 6].map(airLevelOf)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const other of [0, 7, 2.5, -1, '3', null, undefined, true]) {
      expect(airLevelOf(other), String(other)).toBeUndefined();
    }
  });

  it('colours a level by its variable of the theme', () => {
    expect(airLevelColour(5)).toBe('var(--app-air-5)');
  });

  describe('the words of the levels', () => {
    beforeEach(() => TestBed.configureTestingModule({ providers: [provideI18nTesting()] }));

    const words = () => {
      const transloco = TestBed.inject(TranslocoService);
      return ([1, 2, 3, 4, 5, 6] as AirLevel[]).map((level) =>
        transloco.translate(AIR_LEVEL_LABELS[level]),
      );
    };

    it('are the six words of the index', () => {
      expect(words()).toEqual(['Very good', 'Good', 'Moderate', 'Sufficient', 'Bad', 'Very bad']);
    });

    it('are Polish too', async () => {
      await useLanguage('pl');

      expect(words()).toEqual([
        'Bardzo dobra',
        'Dobra',
        'Umiarkowana',
        'Dostateczna',
        'Zła',
        'Bardzo zła',
      ]);
    });
  });
});
