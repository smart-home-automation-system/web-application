import { Injectable, Provider, inject } from '@angular/core';
import { DateAdapter, MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';
import { TranslocoService } from '@jsverse/transloco';

import { MessageKey } from '../../i18n/messages';
import { followLanguage } from './follow-language';
import { LanguageStore } from './language-store';

/** The texts of Angular Material's calendar, and its locale, following the language. */
@Injectable()
export class TranslatedDatepickerIntl extends MatDatepickerIntl {
  private readonly transloco = inject(TranslocoService);

  constructor() {
    super();
    const store = inject(LanguageStore);
    const dateAdapter = inject<DateAdapter<unknown>>(DateAdapter);
    followLanguage(
      store.language,
      () => {
        // month and weekday names, the first day of the week and the parsing of typed dates
        dateAdapter.setLocale(store.locale());
        this.calendarLabel = this.text('material.datepicker.calendar');
        this.openCalendarLabel = this.text('material.datepicker.openCalendar');
        this.closeCalendarLabel = this.text('material.datepicker.closeCalendar');
        this.prevMonthLabel = this.text('material.datepicker.previousMonth');
        this.nextMonthLabel = this.text('material.datepicker.nextMonth');
        this.prevYearLabel = this.text('material.datepicker.previousYear');
        this.nextYearLabel = this.text('material.datepicker.nextYear');
        this.prevMultiYearLabel = this.text('material.datepicker.previousMultiYear');
        this.nextMultiYearLabel = this.text('material.datepicker.nextMultiYear');
        this.switchToMonthViewLabel = this.text('material.datepicker.switchToMonthView');
        this.switchToMultiYearViewLabel = this.text('material.datepicker.switchToMultiYearView');
      },
      () => this.changes.next(),
    );
  }

  private text(key: MessageKey): string {
    return this.transloco.translate(key);
  }
}

/**
 * What a component with a calendar control needs: `providers: [provideCalendar()]` in its own
 * decorator - not in the configuration of the application. Angular Material's calendar is a
 * fifth of a megabyte; named from the configuration, it is downloaded with the first page by
 * everybody, named from the one view that has a calendar, with that view.
 *
 * The control starts in the locale of the language (`MAT_DATE_LOCALE`), and a later change of
 * language reaches it through `TranslatedDatepickerIntl`. It reads **typed** digits the American
 * way, month first, in every language - so a date field here is chosen in the calendar
 * (`readonly` inputs), never typed.
 */
export function provideCalendar(): Provider[] {
  return [
    provideNativeDateAdapter(),
    { provide: MAT_DATE_LOCALE, useFactory: () => inject(LanguageStore).locale() },
    { provide: MatDatepickerIntl, useClass: TranslatedDatepickerIntl },
  ];
}
