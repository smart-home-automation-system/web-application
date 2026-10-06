import { Pipe, PipeTransform, inject } from '@angular/core';

import { dateTimeFormat } from '../../core/i18n/intl-formats';
import { LanguageStore } from '../../core/i18n/language-store';
import { DEFAULT_DATE_TIME_FORMAT } from '../../core/time/house-date-time';

/**
 * Shows a point in time - an ISO instant with an offset, epoch milliseconds or a `Date` - in the
 * zone of the browser and the format of the active language.
 *
 * For a real instant only. A `LocalDateTime` from the backend has no offset and must not be
 * shifted: that one goes through `houseDateTime`.
 *
 * Not pure, for the same reason as `houseDateTime`: the language is not an argument.
 */
@Pipe({ name: 'localDateTime', pure: false })
export class LocalDateTimePipe implements PipeTransform {
  private readonly locale = inject(LanguageStore).locale;

  transform(
    value: string | number | Date | null | undefined,
    options: Intl.DateTimeFormatOptions = DEFAULT_DATE_TIME_FORMAT,
  ): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    const instant = value instanceof Date ? value : new Date(value);
    return Number.isNaN(instant.getTime())
      ? '-'
      : dateTimeFormat(this.locale(), options).format(instant);
  }
}
