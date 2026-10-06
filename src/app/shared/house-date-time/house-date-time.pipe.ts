import { Pipe, PipeTransform, inject } from '@angular/core';

import { LanguageStore } from '../../core/i18n/language-store';
import { memoLast } from '../../core/i18n/memo-last';
import { formatHouseDateTime, parseHouseDateTime } from '../../core/time/house-date-time';

/**
 * Shows a backend `LocalDateTime` as the wall-clock time of the house, whatever the zone of the
 * browser, in the format of the active language. Use it instead of Angular's `date` pipe, which
 * would shift the value.
 *
 * Not pure on purpose: the result depends on the language, which is not an argument - a pure
 * pipe would keep showing the old format after a switch. It remembers its last result instead,
 * so a refresh of the view with nothing changed costs a comparison.
 */
@Pipe({ name: 'houseDateTime', pure: false })
export class HouseDateTimePipe implements PipeTransform {
  private readonly locale = inject(LanguageStore).locale;
  private readonly format = memoLast(
    (value: string | null | undefined, locale: string, options?: Intl.DateTimeFormatOptions) => {
      const parsed = parseHouseDateTime(value);
      return parsed ? formatHouseDateTime(parsed, locale, options) : '-';
    },
  );

  transform(value: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
    return this.format(value, this.locale(), options);
  }
}
