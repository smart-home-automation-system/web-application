import {
  EnvironmentProviders,
  Injectable,
  Provider,
  inject,
  isDevMode,
  provideAppInitializer,
} from '@angular/core';
import { Translation, TranslocoLoader, provideTransloco } from '@jsverse/transloco';
import { Observable } from 'rxjs';

import { LanguageStore } from './language-store';
import { DEFAULT_LANGUAGE, LANGUAGES, MESSAGES_LOADER, isLanguageCode } from './languages';

/** Hands Transloco the texts of a language; where they come from is `MESSAGES_LOADER`'s call. */
@Injectable()
class MessagesTranslocoLoader implements TranslocoLoader {
  private readonly loadMessages = inject(MESSAGES_LOADER);

  getTranslation(language: string): Observable<Translation> {
    return this.loadMessages(isLanguageCode(language) ? language : DEFAULT_LANGUAGE);
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
        // a download that failed is reported at once; trying again is the user's choice
        failedRetries: 0,
        // texts on screen follow a change of language without a reload
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: MessagesTranslocoLoader,
    }),
    // the language chosen earlier is in place before the first page renders: no flash of English
    provideAppInitializer(() => inject(LanguageStore).restore()),
  ];
}
