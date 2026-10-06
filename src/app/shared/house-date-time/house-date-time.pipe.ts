import { Pipe, PipeTransform, inject } from '@angular/core';

import { LanguageStore } from '../../core/i18n/language-store';
import { formatHouseDateTime, parseHouseDateTime } from '../../core/time/house-date-time';

/**
 * Shows a backend `LocalDateTime` as the wall-clock time of the house, whatever the zone of the
 * browser, in the format of the active language. Use it instead of Angular's `date` pipe, which
 * would shift the value.
 *
 * Not pure on purpose: the result depends on the language, which is not an argument - a pure
 * pipe would keep showing the old format after a switch.
 */
@Pipe({ name: 'houseDateTime', pure: false })
export class HouseDateTimePipe implements PipeTransform {
  private readonly locale = inject(LanguageStore).locale;

  transform(value: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
    const parsed = parseHouseDateTime(value);
    return parsed ? formatHouseDateTime(parsed, this.locale(), options) : '-';
  }
}
