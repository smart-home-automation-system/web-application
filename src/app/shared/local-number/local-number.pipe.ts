import { Pipe, PipeTransform, inject } from '@angular/core';

import { numberFormat } from '../../core/i18n/intl-formats';
import { LanguageStore } from '../../core/i18n/language-store';

/**
 * Shows a number the way the active language writes it: `21.5` in English, `21,5` in Polish.
 * The options are those of `Intl.NumberFormat` (`{ maximumFractionDigits: 1 }`).
 *
 * A unit is written next to the number as its symbol (`°C`, `%`, `hPa` - the same in both
 * languages), not with the `unit` style of `Intl`: what that prints depends on the locale data
 * of the engine, and Polish degrees Celsius come out as `st. C`.
 *
 * Not pure, for the same reason as `houseDateTime`: the language is not an argument.
 */
@Pipe({ name: 'localNumber', pure: false })
export class LocalNumberPipe implements PipeTransform {
  private readonly locale = inject(LanguageStore).locale;

  transform(value: number | null | undefined, options: Intl.NumberFormatOptions = {}): string {
    return value === null || value === undefined || !Number.isFinite(value)
      ? '-'
      : numberFormat(this.locale(), options).format(value);
  }
}
