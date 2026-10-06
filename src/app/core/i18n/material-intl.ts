import { Injectable, Signal, effect, inject } from '@angular/core';
import { DateAdapter } from '@angular/material/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { TranslocoService } from '@jsverse/transloco';

import { MessageKey } from '../../i18n/messages';
import { LanguageStore } from './language-store';

/**
 * Angular Material ships its own texts - "Items per page", "Next month" - in English, outside
 * the templates of this application. These two classes replace the holders of those texts with
 * ones that follow the language of the interface.
 *
 * The labels are set while the object is built, so a control created in Polish is Polish from
 * its first render; on a later change of language they are set again and a control already on
 * screen is told to re-read them through `changes`.
 */
function followLanguage(language: Signal<unknown>, apply: () => void, changed: () => void): void {
  apply();
  let built = false;
  effect(() => {
    language();
    // the first run only registers the dependency: the labels were just set
    if (built) {
      apply();
      changed();
    }
    built = true;
  });
}

@Injectable()
export class TranslatedPaginatorIntl extends MatPaginatorIntl {
  private readonly transloco = inject(TranslocoService);

  constructor() {
    super();
    followLanguage(
      inject(LanguageStore).language,
      () => {
        this.itemsPerPageLabel = this.text('material.paginator.itemsPerPage');
        this.nextPageLabel = this.text('material.paginator.nextPage');
        this.previousPageLabel = this.text('material.paginator.previousPage');
        this.firstPageLabel = this.text('material.paginator.firstPage');
        this.lastPageLabel = this.text('material.paginator.lastPage');
      },
      () => this.changes.next(),
    );
  }

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) {
      return this.text('material.paginator.emptyRange', { total: length });
    }
    const start = page * pageSize;
    // a page index beyond the data still shows a sensible range
    const end = start < length ? Math.min(start + pageSize, length) : start + pageSize;
    return this.text('material.paginator.range', { start: start + 1, end, total: length });
  };

  private text(key: MessageKey, params?: Record<string, number>): string {
    return this.transloco.translate(key, params);
  }
}

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
