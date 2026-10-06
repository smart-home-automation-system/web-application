import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

import { LanguageStore } from '../../core/i18n/language-store';
import { DisplayText } from '../../i18n/messages';

/**
 * Puts a `DisplayText` on screen: a text of ours is translated into the active language, words
 * that came from outside (a backend message) are shown untouched.
 *
 *   <span>{{ describeApiError(error) | displayText }}</span>
 *
 * Not pure: the result depends on the language, which is not an argument.
 */
@Pipe({ name: 'displayText', pure: false })
export class DisplayTextPipe implements PipeTransform {
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageStore).language;

  transform(text: DisplayText | null | undefined): string {
    if (text === null || text === undefined) {
      return '';
    }
    if (text.literal !== undefined) {
      return text.literal;
    }
    // read so that the view is refreshed when the language changes
    this.language();
    return this.transloco.translate(text.key, text.params);
  }
}
