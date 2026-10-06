import { InjectionToken } from '@angular/core';
import { Observable, defer, of } from 'rxjs';

import { en } from '../../i18n/en';
import { Messages } from '../../i18n/messages';

export type LanguageCode = 'en' | 'pl';

export interface LanguageOption {
  readonly code: LanguageCode;
  /** The language in its own words - shown as is, never translated. */
  readonly name: string;
  /**
   * Locale that dates and numbers are formatted in. English uses the British one on purpose:
   * a 24-hour clock and day-before-month, which is how this household reads a time.
   */
  readonly locale: string;
}

export const LANGUAGES: readonly LanguageOption[] = [
  { code: 'en', name: 'English', locale: 'en-GB' },
  { code: 'pl', name: 'Polski', locale: 'pl-PL' },
];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export function isLanguageCode(value: unknown): value is LanguageCode {
  return LANGUAGES.some((language) => language.code === value);
}

export type MessagesLoader = (language: LanguageCode) => Observable<Messages>;

/**
 * Where the texts of a language come from - the one place that decides it. A token, so a test
 * can make a download fail.
 */
export const MESSAGES_LOADER = new InjectionToken<MessagesLoader>('MESSAGES_LOADER', {
  providedIn: 'root',
  factory: () => loadMessages,
});

/**
 * English is part of the main bundle - it is the default and the fallback, so it must never be
 * missing - and is answered at once, synchronously: the default language never costs a render.
 * Any other language is a chunk of its own, downloaded when somebody chooses it.
 */
function loadMessages(language: LanguageCode): Observable<Messages> {
  switch (language) {
    case 'pl':
      return defer(() => import('../../i18n/pl').then((module) => module.pl));
    case 'en':
      return of(en);
  }
}
