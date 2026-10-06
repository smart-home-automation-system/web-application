import {
  EnvironmentProviders,
  Injectable,
  Provider,
  inject,
  isDevMode,
  provideAppInitializer,
} from '@angular/core';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { Translation, TranslocoLoader, provideTransloco } from '@jsverse/transloco';
import { Observable, defer, of } from 'rxjs';

import { en } from '../../i18n/en';
import { LanguageStore } from './language-store';
import { DEFAULT_LANGUAGE, LANGUAGES, MESSAGES_LOADER, isLanguageCode } from './languages';
import { TranslatedDatepickerIntl, TranslatedPaginatorIntl } from './material-intl';

/**
 * How Transloco gets the texts of a language. English is answered at once, from the bundle - an
 * observable that emits synchronously, so the default language never costs a render; any other
 * language is a download.
 */
@Injectable()
class MessagesTranslocoLoader implements TranslocoLoader {
  private readonly loadMessages = inject(MESSAGES_LOADER);

  getTranslation(language: string): Observable<Translation> {
    return isLanguageCode(language) && language !== DEFAULT_LANGUAGE
      ? defer(() => this.loadMessages(language))
      : of(en);
  }
}

/** Everything the two-language interface needs; the same set runs in the unit tests. */
export function provideI18n(): (Provider | EnvironmentProviders)[] {
  return [
    provideTransloco({
      config: {
        availableLangs: LANGUAGES.map((language) => language.code),
        defaultLang: DEFAULT_LANGUAGE,
        // a key missing from a language is shown in English rather than as its name
        fallbackLang: DEFAULT_LANGUAGE,
        missingHandler: { useFallbackTranslation: true, logMissingKey: true },
        // texts on screen follow a change of language without a reload
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: MessagesTranslocoLoader,
    }),
    // the language chosen earlier is in place before the first page renders: no flash of English
    provideAppInitializer(() => inject(LanguageStore).restore()),
    provideNativeDateAdapter(),
    { provide: MatPaginatorIntl, useClass: TranslatedPaginatorIntl },
    { provide: MatDatepickerIntl, useClass: TranslatedDatepickerIntl },
  ];
}
