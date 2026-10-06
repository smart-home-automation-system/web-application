import { TestBed } from '@angular/core/testing';
import { DateAdapter } from '@angular/material/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';
import { MatPaginatorIntl } from '@angular/material/paginator';

import { provideI18nTesting, useLanguage } from '../../../testing/i18n';

describe('labels of Angular Material controls', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideI18nTesting()] }));

  describe('paginator', () => {
    it('starts in English', () => {
      const intl = TestBed.inject(MatPaginatorIntl);

      expect(intl.itemsPerPageLabel).toBe('Items per page:');
      expect(intl.getRangeLabel(0, 10, 25)).toBe('1 – 10 of 25');
    });

    // a control created while Polish is active must not show English for its first render
    it('is Polish from the start when it is created in Polish', async () => {
      await useLanguage('pl');

      const intl = TestBed.inject(MatPaginatorIntl);

      expect(intl.itemsPerPageLabel).toBe('Pozycji na stronie:');
    });

    it('follows the language and tells the components on screen to re-read the labels', async () => {
      const intl = TestBed.inject(MatPaginatorIntl);
      TestBed.tick();
      let changes = 0;
      intl.changes.subscribe(() => changes++);

      await useLanguage('pl');
      TestBed.tick();

      expect(intl.itemsPerPageLabel).toBe('Pozycji na stronie:');
      expect(intl.nextPageLabel).toBe('Następna strona');
      expect(intl.getRangeLabel(2, 10, 25)).toBe('21 – 25 z 25');
      expect(changes).toBe(1);
    });

    it('does not announce a change that did not happen', () => {
      const intl = TestBed.inject(MatPaginatorIntl);
      let changes = 0;
      intl.changes.subscribe(() => changes++);

      TestBed.tick();

      expect(changes).toBe(0);
    });

    it.each([
      [0, 10, 0, '0 of 0'],
      [0, 0, 25, '0 of 25'],
      [1, 10, 25, '11 – 20 of 25'],
      // a page index beyond the data: Material's own label keeps counting, so does this one
      [5, 10, 25, '51 – 60 of 25'],
    ])('labels page %i of size %i over %i items as "%s"', (page, size, length, expected) => {
      expect(TestBed.inject(MatPaginatorIntl).getRangeLabel(page, size, length)).toBe(expected);
    });
  });

  describe('date picker', () => {
    it('follows the language, labels and calendar alike', async () => {
      const intl = TestBed.inject(MatDatepickerIntl);
      const adapter = TestBed.inject<DateAdapter<Date>>(DateAdapter);

      expect(intl.openCalendarLabel).toBe('Open calendar');
      expect(adapter.getMonthNames('long')[0]).toBe('January');

      TestBed.tick();
      await useLanguage('pl');
      TestBed.tick();

      expect(intl.openCalendarLabel).toBe('Otwórz kalendarz');
      expect(intl.nextMonthLabel).toBe('Następny miesiąc');
      expect(adapter.getMonthNames('long')[0]).toBe('styczeń');
      // the week starts on Monday in both locales this application uses
      expect(adapter.getFirstDayOfWeek()).toBe(1);
    });

    it('is Polish from the start when it is created in Polish', async () => {
      await useLanguage('pl');

      const intl = TestBed.inject(MatDatepickerIntl);

      expect(intl.calendarLabel).toBe('Kalendarz');
      expect(TestBed.inject<DateAdapter<Date>>(DateAdapter).getMonthNames('long')[11]).toBe(
        'grudzień',
      );
    });
  });
});
