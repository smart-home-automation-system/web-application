import { DOCUMENT } from '@angular/common';
import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  LanguageCode,
  LanguageOption,
  isLanguageCode,
} from './languages';

/**
 * Where the choice is kept. One key for the whole browser today; a phone is one person's, and
 * the profiles (HAS-193) will scope it per household member on a shared screen.
 */
const STORAGE_KEY = 'smart-home.language';

/**
 * How long the start of the application waits for the texts of the stored language. On a weak
 * connection the download can take long or never answer; the application then starts in English
 * and changes over when the texts arrive.
 */
export const RESTORE_TIMEOUT_MS = 3_000;

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
  private readonly document = inject(DOCUMENT);
  private readonly active = signal<LanguageCode>(DEFAULT_LANGUAGE);
  /** Counts the choices, so that a slow download cannot overrule a later one. */
  private choices = 0;

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

  /**
   * Brings back the language chosen earlier; run once, before the application renders. Waits for
   * its texts only so long - the application must start whatever the connection does.
   */
  async restore(): Promise<void> {
    const stored = readStored();
    if (stored === undefined || stored === this.active()) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const patience = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, RESTORE_TIMEOUT_MS);
    });
    // the download is not abandoned: when it arrives later, the interface changes over
    await Promise.race([this.select(stored), patience]);
    clearTimeout(timer);
  }

  /**
   * Switches the interface to the language and remembers the choice. Answers false, leaving
   * everything as it was, when the texts cannot be fetched - a connection lost, or a new version
   * deployed since this tab was opened. Trying again later starts a fresh download.
   *
   * When another language is chosen before the texts of this one arrive, the later choice wins
   * whichever download finishes first.
   */
  async select(language: LanguageCode): Promise<boolean> {
    const choice = ++this.choices;
    try {
      // Transloco keeps the texts once loaded, so every view finds them ready; a failed load
      // completes without a value, which is what makes this throw
      await firstValueFrom(this.transloco.load(language));
    } catch (error) {
      console.error(`Could not load the texts of "${language}"`, error);
      return false;
    }
    if (choice === this.choices) {
      this.activate(language);
      store(language);
    }
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
