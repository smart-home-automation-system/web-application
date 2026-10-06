import { DOCUMENT } from '@angular/common';
import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  LanguageCode,
  LanguageOption,
  MESSAGES_LOADER,
  isLanguageCode,
} from './languages';

/**
 * Where the choice is kept. One key for the whole browser today; a phone is one person's, and
 * the profiles (HAS-193) will scope it per household member on a shared screen.
 */
const STORAGE_KEY = 'smart-home.language';

/**
 * The language of the interface: which one is active, how to change it, and the locale that
 * dates and numbers follow. English unless somebody chose otherwise - the language of the
 * browser is deliberately not consulted.
 *
 * `language` and `locale` change only after the texts of the new language are in memory, so
 * anything that reads them can translate at once.
 */
@Injectable({ providedIn: 'root' })
export class LanguageStore {
  private readonly transloco = inject(TranslocoService);
  private readonly loadMessages = inject(MESSAGES_LOADER);
  private readonly document = inject(DOCUMENT);
  private readonly active = signal<LanguageCode>(DEFAULT_LANGUAGE);

  readonly options: readonly LanguageOption[] = LANGUAGES;
  readonly language: Signal<LanguageCode> = this.active.asReadonly();
  readonly locale: Signal<string> = computed(
    () => LANGUAGES.find((option) => option.code === this.active())?.locale ?? 'en-GB',
  );

  constructor() {
    // English is in the bundle and its loader answers at once, so this completes right here:
    // the default language is ready before anything renders, with nothing to wait for
    this.transloco.load(DEFAULT_LANGUAGE).subscribe();
    this.activate(DEFAULT_LANGUAGE);
  }

  /** Brings back the language chosen earlier; run once, before the application renders. */
  async restore(): Promise<void> {
    const stored = readStored();
    if (stored !== undefined && stored !== this.active()) {
      await this.select(stored);
    }
  }

  /**
   * Switches the interface to the language and remembers the choice. Answers false, leaving
   * everything as it was, when the texts cannot be fetched - a connection lost, or a new version
   * deployed since this tab was opened.
   */
  async select(language: LanguageCode): Promise<boolean> {
    try {
      // the download first, on its own: its failure is the one thing that can go wrong here, and
      // Transloco would answer it by quietly falling back to English
      await this.loadMessages(language);
      // then hand the texts to Transloco, which keeps them: every view finds them ready
      await firstValueFrom(this.transloco.load(language));
    } catch (error) {
      console.error(`Could not load the texts of "${language}"`, error);
      return false;
    }
    this.activate(language);
    store(language);
    return true;
  }

  private activate(language: LanguageCode): void {
    this.transloco.setActiveLang(language);
    // screen readers pick the voice, and the browser the hyphenation, from this attribute
    this.document.documentElement.lang = language;
    this.active.set(language);
  }
}

// storage can be unavailable (private mode, blocked site data): the choice then lasts a session

function readStored(): LanguageCode | undefined {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLanguageCode(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function store(language: LanguageCode): void {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // nothing to do
  }
}
