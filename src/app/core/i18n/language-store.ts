import { DOCUMENT } from '@angular/common';
import {
  Injectable,
  InjectionToken,
  Signal,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
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
 * Where the choice is kept: under this key what was chosen while nobody had a profile - the
 * language of the device - and under `<key>.<member>` what a household member chose.
 */
const STORAGE_KEY = 'smart-home.language';

/**
 * Whose choice the language is: the name of the active household member, `undefined` while
 * there is none. The application binds it to the profile (`app.config.ts`); by itself the
 * interface has one language for the whole browser, which is all a unit test needs.
 */
export const LANGUAGE_OWNER = new InjectionToken<Signal<string | undefined>>('LANGUAGE_OWNER', {
  providedIn: 'root',
  factory: () => signal(undefined).asReadonly(),
});

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
 * The choice belongs to the household member using the application: on a screen that changes
 * hands the interface follows the profile. A member who never chose gets the language of the
 * device, so a browser that spoke Polish before the profiles existed still does.
 *
 * `language` and `locale` change only after the texts of the new language are in memory, so
 * anything that reads them can translate at once.
 */
@Injectable({ providedIn: 'root' })
export class LanguageStore {
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);
  private readonly owner = inject(LANGUAGE_OWNER);
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
    this.followOwner();
  }

  /**
   * Brings back the language chosen earlier; run once, before the application renders. Waits for
   * its texts only so long - the application must start whatever the connection does.
   */
  async restore(): Promise<void> {
    const stored = this.chosen();
    if (stored === this.active()) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const patience = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, RESTORE_TIMEOUT_MS);
    });
    // the download is not abandoned: when it arrives later, the interface changes over
    await Promise.race([this.change(stored, false), patience]);
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
  select(language: LanguageCode): Promise<boolean> {
    return this.change(language, true);
  }

  /** `remember` is false when the language is not being chosen but brought back. */
  private async change(language: LanguageCode, remember: boolean): Promise<boolean> {
    const choice = ++this.choices;
    // whose choice this is - read now: the application can change hands before the texts arrive
    const owner = this.owner();
    try {
      // Transloco keeps the texts once loaded, so every view finds them ready; a failed load
      // completes without a value, which is what makes this throw
      await firstValueFrom(this.transloco.load(language));
    } catch (error) {
      console.error(`Could not load the texts of "${language}"`, error);
      return false;
    }
    if (choice === this.choices) {
      // the interface belongs to whoever uses the application now; the choice, to who made it
      if (owner === this.owner()) {
        this.activate(language);
      }
      if (remember) {
        store(keyOf(owner), language);
      }
    }
    return true;
  }

  /** What the member using the application chose; failing that, the language of the device. */
  private chosen(): LanguageCode {
    const owner = this.owner();
    return (
      (owner === undefined ? undefined : readStored(keyOf(owner))) ??
      readStored(STORAGE_KEY) ??
      DEFAULT_LANGUAGE
    );
  }

  /** When the application changes hands, the interface changes to the language of the new member. */
  private followOwner(): void {
    let known = untracked(this.owner);
    effect(() => {
      const owner = this.owner();
      if (owner === known) {
        return;
      }
      known = owner;
      untracked(() => {
        const language = this.chosen();
        if (language !== this.active()) {
          void this.change(language, false);
        }
      });
    });
  }

  private activate(language: LanguageCode): void {
    this.transloco.setActiveLang(language);
    // screen readers pick the voice, and the browser the hyphenation, from this attribute
    this.document.documentElement.lang = language;
    this.active.set(language);
  }
}

// storage can be unavailable (private mode, blocked site data): the choice then lasts a session

function keyOf(owner: string | undefined): string {
  return owner === undefined ? STORAGE_KEY : `${STORAGE_KEY}.${owner}`;
}

function readStored(key: string): LanguageCode | undefined {
  try {
    const value = localStorage.getItem(key);
    return isLanguageCode(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function store(key: string, language: LanguageCode): void {
  try {
    localStorage.setItem(key, language);
  } catch {
    // nothing to do
  }
}
