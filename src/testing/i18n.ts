import { EnvironmentProviders, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LanguageStore } from '../app/core/i18n/language-store';
import { LanguageCode } from '../app/core/i18n/languages';
import { provideI18n } from '../app/core/i18n/provide-i18n';

/**
 * The i18n of the application for a unit test: the real texts, loader and language store, so a
 * test reads what a user would read. Add it to the providers of any test that renders a
 * template; the interface starts in English.
 */
export function provideI18nTesting(): (Provider | EnvironmentProviders)[] {
  // a language chosen by an earlier test must not leak into this one
  localStorage.removeItem('smart-home.language');
  return provideI18n();
}

/** Switches the interface of the running test, the way the language menu does. */
export async function useLanguage(language: LanguageCode): Promise<void> {
  const switched = await TestBed.inject(LanguageStore).select(language);
  if (!switched) {
    throw new Error(`The texts of "${language}" could not be loaded`);
  }
}
