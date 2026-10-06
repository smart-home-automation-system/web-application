import { TestBed } from '@angular/core/testing';

import { provideI18nTesting, useLanguage } from '../../testing/i18n';
import { HouseDateTimePipe } from './house-date-time/house-date-time.pipe';
import { LocalDateTimePipe } from './local-date-time/local-date-time.pipe';
import { LocalNumberPipe } from './local-number/local-number.pipe';

describe('formatting pipes', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideI18nTesting()] }));

  function pipe<T>(type: new () => T): T {
    return TestBed.runInInjectionContext(() => new type());
  }

  describe('houseDateTime', () => {
    it('shows house time as sent, with a 24-hour clock in English', () => {
      expect(pipe(HouseDateTimePipe).transform('2026-09-28T06:45:12.840868')).toBe(
        '28 Sept 2026, 06:45',
      );
    });

    it('follows the language without being created again', async () => {
      const houseDateTime = pipe(HouseDateTimePipe);

      await useLanguage('pl');

      expect(houseDateTime.transform('2026-09-28T06:45:12')).toBe('28 wrz 2026, 06:45');
    });

    it.each([undefined, null, '', 'yesterday', '2026-10-05T07:00:00Z'])(
      'shows a dash for %s',
      (value) => {
        expect(pipe(HouseDateTimePipe).transform(value)).toBe('-');
      },
    );
  });

  describe('localDateTime', () => {
    // the zone of the machine decides the hour, so only the parts that do not depend on it
    it('shows an instant in the format of the language', async () => {
      const localDateTime = pipe(LocalDateTimePipe);
      const noon = new Date(2026, 9, 6, 12, 30, 0);

      expect(localDateTime.transform(noon)).toBe('6 Oct 2026, 12:30');

      await useLanguage('pl');

      expect(localDateTime.transform(noon)).toBe('6 paź 2026, 12:30');
    });

    it('accepts an ISO instant and epoch milliseconds', () => {
      const localDateTime = pipe(LocalDateTimePipe);
      const noon = new Date(2026, 9, 6, 12, 30, 0);

      expect(localDateTime.transform(noon.toISOString())).toBe('6 Oct 2026, 12:30');
      expect(localDateTime.transform(noon.getTime())).toBe('6 Oct 2026, 12:30');
    });

    it.each([undefined, null, '', 'not a date'])('shows a dash for %s', (value) => {
      expect(pipe(LocalDateTimePipe).transform(value)).toBe('-');
    });
  });

  describe('localNumber', () => {
    it('writes the decimal separator of the language', async () => {
      const localNumber = pipe(LocalNumberPipe);

      expect(localNumber.transform(21.5)).toBe('21.5');

      await useLanguage('pl');

      expect(localNumber.transform(21.5)).toBe('21,5');
    });

    it('rounds to the digits asked for', async () => {
      const localNumber = pipe(LocalNumberPipe);
      const oneDigit = { minimumFractionDigits: 1, maximumFractionDigits: 1 };

      expect(localNumber.transform(21.46, oneDigit)).toBe('21.5');
      expect(localNumber.transform(21, oneDigit)).toBe('21.0');

      await useLanguage('pl');

      expect(localNumber.transform(21.46, oneDigit)).toBe('21,5');
    });

    it('groups thousands the way the language does', async () => {
      const localNumber = pipe(LocalNumberPipe);

      expect(localNumber.transform(12345.6)).toBe('12,345.6');

      await useLanguage('pl');

      // Polish separates thousands with a (non-breaking) space
      expect(localNumber.transform(12345.6).replace(/\s/g, ' ')).toBe('12 345,6');
    });

    it.each([undefined, null, Number.NaN, Number.POSITIVE_INFINITY])(
      'shows a dash for %s',
      (value) => {
        expect(pipe(LocalNumberPipe).transform(value)).toBe('-');
      },
    );
  });
});
