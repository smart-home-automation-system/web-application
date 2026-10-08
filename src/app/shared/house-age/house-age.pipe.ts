import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

import { APP_CONFIG } from '../../core/config/app-config';
import { LanguageStore } from '../../core/i18n/language-store';
import { memoLast } from '../../core/i18n/memo-last';
import { houseInstant, parseHouseDateTime } from '../../core/time/house-date-time';
import { Ticker } from '../../core/time/ticker';
import { JUST_NOW_MS, formatAge } from '../age/format-age';

/**
 * How long ago a backend `LocalDateTime` was, in the words of the active language: "3 min ago",
 * "just now". The value is the wall-clock time of the house, so its age is worked out in the
 * zone of the house - the same on a phone abroad. A value that is not a date-time shows nothing;
 * one that lies ahead (the clocks of the browser and the house differ a little) is "just now".
 *
 * Not pure: the result moves with the clock and the language. It reads the shared `Ticker`, so
 * the view that uses it is refreshed every few seconds and no more.
 */
@Pipe({ name: 'houseAge', pure: false })
export class HouseAgePipe implements PipeTransform {
  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly ticker = inject(Ticker);
  private readonly languages = inject(LanguageStore);
  private readonly transloco = inject(TranslocoService);

  /**
   * When the value was: the same for as long as the value is, so it is worked out once and not
   * on every refresh of the view - only the subtraction below moves with the clock.
   */
  private readonly instant = memoLast((value: string | null | undefined, zone: string) => {
    const parsed = parseHouseDateTime(value);
    return parsed ? houseInstant(parsed, zone) : undefined;
  });

  transform(value: string | null | undefined): string {
    const instant = this.instant(value, this.zone);
    if (instant === undefined) {
      return '';
    }
    const ageMs = this.ticker.now() - instant;
    if (ageMs < JUST_NOW_MS) {
      // read so that the view is refreshed when the language changes
      this.languages.language();
      return this.transloco.translate('freshness.justNow');
    }
    return formatAge(ageMs, this.languages.locale());
  }
}
