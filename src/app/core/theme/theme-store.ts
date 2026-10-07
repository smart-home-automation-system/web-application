import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, Signal, computed, effect, inject, signal } from '@angular/core';

import { isRecord, readJson, watchKey, writeJson } from '../storage/browser-storage';
import { Season, isSeason, millisecondsUntilTomorrow, seasonOf } from './season';

export type ColorScheme = 'light' | 'dark';
/** What somebody chose: a season, or the calendar. */
export type SeasonChoice = Season | 'auto';
/** What somebody chose: a colour scheme, or the setting of the system. */
export type SchemeChoice = ColorScheme | 'system';

/** Where the choices are kept. One key for the whole browser, like the language. */
const STORAGE_KEY = 'smart-home.theme';

/**
 * A little past midnight: a timer may fire a few milliseconds early, and the day must have
 * changed by then.
 */
const AFTER_MIDNIGHT_MS = 1_000;

/** The longest the calendar goes unread while the application is open. */
const LOOK_AGAIN_MS = 3_600_000;

/**
 * The colours of the application. They follow the season - worked out from the clock of the
 * browser - and the light / dark setting of the system; either can be overridden, which is meant
 * for looking at the other variants and is remembered in the browser.
 *
 * The styles do the painting (`src/theme/_seasons.scss`). This class only tells them what to
 * paint, through two attributes of `<html>`: `data-season`, always, and `data-color-scheme`,
 * present only while the system setting is overridden. It also keeps two `<meta>` tags in step:
 * `color-scheme` (how the browser draws its own parts - scroll bars, form controls) and
 * `theme-color` (the status bar of a phone, which should continue the page).
 *
 * A dashboard stays open for weeks, so the season is looked at again when the day changes, at
 * least once an hour, and whenever the tab comes back into view - a sleeping device runs no
 * timers.
 *
 * Until Angular has started there is nothing to set the attributes: the page is then painted
 * in the default season and the scheme of the system. With an overridden scheme that shows as
 * a brief flash of the other one on every load - accepted for a preview setting: avoiding it takes a
 * second, render-blocking script file ahead of the application (the Content-Security-Policy
 * allows no inline one), with its own copy of the validation here.
 */
@Injectable({ providedIn: 'root' })
export class ThemeStore {
  private readonly document = inject(DOCUMENT);
  private readonly calendar = signal(seasonOf(new Date()));
  private readonly systemDark = signal(false);
  private readonly chosenSeason = signal<SeasonChoice>('auto');
  private readonly chosenScheme = signal<SchemeChoice>('system');
  private calendarTimer: ReturnType<typeof setTimeout> | undefined;
  /** What `apply` painted last. */
  private applied: string | undefined;

  /** The season by the calendar, whatever is chosen. */
  readonly calendarSeason: Signal<Season> = this.calendar.asReadonly();
  readonly seasonChoice: Signal<SeasonChoice> = this.chosenSeason.asReadonly();
  readonly schemeChoice: Signal<SchemeChoice> = this.chosenScheme.asReadonly();

  /** The season whose colours are on screen. */
  readonly season: Signal<Season> = computed(() => {
    const choice = this.chosenSeason();
    return choice === 'auto' ? this.calendar() : choice;
  });

  /** The colour scheme on screen. */
  readonly scheme: Signal<ColorScheme> = computed(() => {
    const choice = this.chosenScheme();
    if (choice === 'system') {
      return this.systemDark() ? 'dark' : 'light';
    }
    return choice;
  });

  /** True while a season or a scheme is chosen by hand. */
  readonly overridden: Signal<boolean> = computed(
    () => this.chosenSeason() !== 'auto' || this.chosenScheme() !== 'system',
  );

  constructor() {
    this.readChoices();
    this.watchSystemScheme();
    this.watchCalendar();
    this.watchOtherTabs();

    // once right now, so the first page Angular renders already has its colours, and then on
    // every change
    this.apply();
    effect(() => this.apply());
  }

  private readChoices(): void {
    const stored = readStored();
    this.chosenSeason.set(stored.season);
    this.chosenScheme.set(stored.scheme);
  }

  chooseSeason(choice: SeasonChoice): void {
    this.chosenSeason.set(choice);
    this.store();
  }

  chooseScheme(choice: SchemeChoice): void {
    this.chosenScheme.set(choice);
    this.store();
  }

  /** Back to the calendar and the system setting. */
  reset(): void {
    this.chosenSeason.set('auto');
    this.chosenScheme.set('system');
    this.store();
  }

  private apply(): void {
    const root = this.document.documentElement;
    const choice = this.chosenScheme();
    const scheme = this.scheme();
    const season = this.season();

    // reading the page colour below makes the browser recalculate its styles: only when
    // something has actually changed
    const state = `${season} ${choice} ${scheme}`;
    if (state === this.applied) {
      return;
    }
    this.applied = state;

    root.setAttribute('data-season', season);
    if (choice === 'system') {
      root.removeAttribute('data-color-scheme');
    } else {
      root.setAttribute('data-color-scheme', choice);
    }
    this.meta('color-scheme').content = choice === 'system' ? 'light dark' : choice;

    // The colour of the page, read back from the styles: it exists once per scheme as a plain
    // value because a <meta> understands neither variables nor light-dark(). Empty where no
    // stylesheet is loaded (unit tests) - the tag is then left alone.
    const bar = this.document.defaultView
      ?.getComputedStyle(root)
      .getPropertyValue(`--app-bar-${scheme}`)
      .trim();
    if (bar) {
      this.meta('theme-color').content = bar;
    }
  }

  private meta(name: string): HTMLMetaElement {
    const head = this.document.head;
    let tag = head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (tag === null) {
      tag = this.document.createElement('meta');
      tag.name = name;
      head.appendChild(tag);
    }
    return tag;
  }

  private watchSystemScheme(): void {
    // absent in the DOM used by unit tests
    const query = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
    if (query === undefined) {
      return;
    }
    this.systemDark.set(query.matches);
    const update = (event: MediaQueryListEvent) => this.systemDark.set(event.matches);
    query.addEventListener('change', update);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', update));
  }

  private watchCalendar(): void {
    const look = () => {
      this.calendar.set(seasonOf(new Date()));
      // Set again on every look, for midnight - but never further away than an hour. A device
      // that slept with the page in view sends no visibility event when it wakes, and its timers
      // carry on where they stopped: a single timer set for midnight could then be a day late.
      clearTimeout(this.calendarTimer);
      this.calendarTimer = setTimeout(
        look,
        Math.min(millisecondsUntilTomorrow(new Date()) + AFTER_MIDNIGHT_MS, LOOK_AGAIN_MS),
      );
    };
    const onVisibility = () => {
      if (this.document.visibilityState === 'visible') {
        look();
      }
    };
    look();
    this.document.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.calendarTimer);
      this.document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  /**
   * A choice made in another tab, or in the installed application next to the browser, arrives
   * here too. Without it this tab would keep the old colours and, at its next choice, write its
   * stale half back over the newer one.
   */
  private watchOtherTabs(): void {
    watchKey(STORAGE_KEY, () => this.readChoices());
  }

  /** Kept only while something is overridden: nothing chosen leaves nothing behind. */
  private store(): void {
    writeJson(
      STORAGE_KEY,
      this.overridden() ? { season: this.chosenSeason(), scheme: this.chosenScheme() } : undefined,
    );
  }
}

function readStored(): { season: SeasonChoice; scheme: SchemeChoice } {
  // unreadable storage, or a value that is not what this store writes: as if nothing was chosen
  const value = readJson(STORAGE_KEY);
  const { season, scheme } = isRecord(value) ? value : {};
  return {
    season: isSeason(season) ? season : 'auto',
    scheme: scheme === 'light' || scheme === 'dark' ? scheme : 'system',
  };
}
