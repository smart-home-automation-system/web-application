import { LOCALE_ID, Pipe, PipeTransform, inject } from '@angular/core';

import { formatHouseDateTime, parseHouseDateTime } from '../../core/time/house-date-time';

/**
 * Shows a backend `LocalDateTime` as the wall-clock time of the house, whatever the zone of the
 * browser. Use it instead of Angular's `date` pipe, which would shift the value.
 */
@Pipe({ name: 'houseDateTime' })
export class HouseDateTimePipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(value: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
    const parsed = parseHouseDateTime(value);
    return parsed ? formatHouseDateTime(parsed, this.locale, options) : '-';
  }
}
