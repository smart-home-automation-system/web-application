import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { NEVER, Observable, Subject, of, throwError } from 'rxjs';

import { provideI18nTesting } from '../../../testing/i18n';
import { en } from '../../i18n/en';
import { Messages } from '../../i18n/messages';
import { pl } from '../../i18n/pl';
import { LANGUAGE_OWNER, LanguageStore, RESTORE_TIMEOUT_MS } from './language-store';
import { LanguageCode, MESSAGES_LOADER, MessagesLoader } from './languages';

const STORAGE_KEY = 'smart-home.language';

describe('LanguageStore', () => {
  /** `polish` decides what a download of the Polish texts does; English is always at hand. */
  function create(options: { stored?: string; polish?: () => Observable<Messages> } = {}) {
    const loader: MessagesLoader = (language: LanguageCode) =>
      language === 'en' ? of(en) : (options.polish ?? (() => of(pl)))();
    TestBed.configureTestingModule({
      providers: [provideI18nTesting(), { provide: MESSAGES_LOADER, useValue: loader }],
    });
    if (options.stored !== undefined) {
      localStorage.setItem(STORAGE_KEY, options.stored);
    }
    return TestBed.inject(LanguageStore);
  }

  function translate(key: string): string {
    return TestBed.inject(TranslocoService).translate(key);
  }

  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.removeItem(STORAGE_KEY);
    document.documentElement.lang = 'en';
  });

  it('starts in English, whatever the language of the browser', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('pl-PL');

    const store = create();
    await store.restore();

    expect(store.language()).toBe('en');
    expect(store.locale()).toBe('en-GB');
    expect(translate('nav.overview')).toBe('Overview');
    expect(document.documentElement.lang).toBe('en');
  });

  it('has the English texts ready the moment it exists, with nothing to wait for', () => {
    create();

    expect(translate('nav.about')).toBe('About');
  });

  it('translates at once after a switch, and tells the page which language it is in', async () => {
    const store = create();

    expect(await store.select('pl')).toBe(true);

    expect(store.language()).toBe('pl');
    expect(store.locale()).toBe('pl-PL');
    expect(translate('nav.overview')).toBe('Przegląd');
    expect(document.documentElement.lang).toBe('pl');
  });

  it('remembers the choice', async () => {
    const store = create();

    await store.select('pl');

    expect(localStorage.getItem(STORAGE_KEY)).toBe('pl');
  });

  it('brings the chosen language back at the next start', async () => {
    const store = create({ stored: 'pl' });

    await store.restore();

    expect(store.language()).toBe('pl');
    expect(translate('nav.about')).toBe('O aplikacji');
  });

  it.each(['de', '', 'PL', '{"lang":"pl"}'])('ignores a stored value of "%s"', async (stored) => {
    const store = create({ stored });

    await store.restore();

    expect(store.language()).toBe('en');
  });

  it('switches back to English', async () => {
    const store = create({ stored: 'pl' });
    await store.restore();

    await store.select('en');

    expect(store.language()).toBe('en');
    expect(translate('nav.overview')).toBe('Overview');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('en');
  });

  it('downloads the texts of a language once, however often it is chosen', async () => {
    const polish = vi.fn(() => of(pl));
    const store = create({ polish });

    await store.select('pl');
    await store.select('en');
    await store.select('pl');

    expect(polish).toHaveBeenCalledTimes(1);
  });

  describe('when the texts cannot be fetched', () => {
    const failing = () => throwError(() => new Error('the chunk is gone'));

    it('stays in the current language and does not remember the failed choice', async () => {
      const store = create({ polish: failing });

      expect(await store.select('pl')).toBe(false);

      expect(store.language()).toBe('en');
      expect(translate('nav.overview')).toBe('Overview');
      expect(document.documentElement.lang).toBe('en');
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('starts in English when the stored language cannot be loaded', async () => {
      const store = create({ stored: 'pl', polish: failing });

      await store.restore();

      expect(store.language()).toBe('en');
    });

    // the failure must not be remembered: the connection may be back the next time
    it('downloads again when the language is chosen once more', async () => {
      let broken = true;
      const polish = vi.fn(() => (broken ? failing() : of(pl)));
      const store = create({ polish });
      expect(await store.select('pl')).toBe(false);

      broken = false;

      expect(await store.select('pl')).toBe(true);
      expect(store.language()).toBe('pl');
      expect(translate('nav.overview')).toBe('Przegląd');
      expect(polish).toHaveBeenCalledTimes(2);
    });
  });

  describe('when the download of the stored language does not answer', () => {
    it('lets the application start in English after a while', async () => {
      vi.useFakeTimers();
      const store = create({ stored: 'pl', polish: () => NEVER });
      let started = false;

      void store.restore().then(() => (started = true));
      await vi.advanceTimersByTimeAsync(RESTORE_TIMEOUT_MS - 1);
      expect(started).toBe(false);

      await vi.advanceTimersByTimeAsync(1);

      expect(started).toBe(true);
      expect(store.language()).toBe('en');
    });

    it('changes over when the texts arrive after all', async () => {
      vi.useFakeTimers();
      const download = new Subject<Messages>();
      const store = create({ stored: 'pl', polish: () => download });
      const restored = store.restore();
      await vi.advanceTimersByTimeAsync(RESTORE_TIMEOUT_MS);
      await restored;
      expect(store.language()).toBe('en');

      download.next(pl);
      download.complete();
      await vi.advanceTimersByTimeAsync(0);

      expect(store.language()).toBe('pl');
      expect(translate('nav.overview')).toBe('Przegląd');
    });

    // the clock is frozen here: this resolves only because nothing waits for the timeout
    it('does not wait at all when the texts are quick', async () => {
      vi.useFakeTimers();
      const store = create({ stored: 'pl' });

      await store.restore();

      expect(store.language()).toBe('pl');
    });
  });

  // a slow download must not overrule what was chosen after it
  it('keeps the later choice when an earlier download finishes last', async () => {
    const download = new Subject<Messages>();
    const store = create({ polish: () => download });

    const polish = store.select('pl');
    const english = store.select('en');
    await english;
    expect(store.language()).toBe('en');

    download.next(pl);
    download.complete();

    expect(await polish).toBe(true);
    expect(store.language()).toBe('en');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('works without storage: the choice then lasts as long as the page', async () => {
    const store = create();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(await store.select('pl')).toBe(true);

    expect(store.language()).toBe('pl');
  });
});

describe('LanguageStore, with household profiles', () => {
  const owner = signal<string | undefined>(undefined);

  /** `stored` is what the browser remembers: the language of the device, and of members. */
  function create(stored: { device?: string; members?: Record<string, string> } = {}) {
    TestBed.configureTestingModule({
      providers: [provideI18nTesting(), { provide: LANGUAGE_OWNER, useValue: owner }],
    });
    if (stored.device !== undefined) {
      localStorage.setItem(STORAGE_KEY, stored.device);
    }
    for (const [member, language] of Object.entries(stored.members ?? {})) {
      localStorage.setItem(`${STORAGE_KEY}.${member}`, language);
    }
    return TestBed.inject(LanguageStore);
  }

  /** The store follows a change of the profile through an effect, and then loads the texts. */
  async function settle(): Promise<void> {
    TestBed.tick();
    await Promise.resolve();
    await Promise.resolve();
  }

  beforeEach(() => owner.set(undefined));

  afterEach(() => {
    for (const key of [STORAGE_KEY, `${STORAGE_KEY}.Aurelia`, `${STORAGE_KEY}.Borys`]) {
      localStorage.removeItem(key);
    }
    document.documentElement.lang = 'en';
  });

  it('remembers the choice for the member who made it, not for the device', async () => {
    owner.set('Aurelia');
    const store = create();

    await store.select('pl');

    expect(localStorage.getItem(`${STORAGE_KEY}.Aurelia`)).toBe('pl');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('starts in the language of the member remembered', async () => {
    owner.set('Aurelia');
    const store = create({ device: 'en', members: { Aurelia: 'pl' } });

    await store.restore();

    expect(store.language()).toBe('pl');
  });

  // a browser that spoke Polish before the profiles existed still does
  it('gives a member who never chose the language of the device', async () => {
    owner.set('Borys');
    const store = create({ device: 'pl' });

    await store.restore();

    expect(store.language()).toBe('pl');
    expect(localStorage.getItem(`${STORAGE_KEY}.Borys`)).toBeNull();
  });

  it('changes to the language of the member who takes over, and back', async () => {
    owner.set('Aurelia');
    const store = create({ members: { Aurelia: 'pl' } });
    await store.restore();
    await settle();

    owner.set('Borys');
    await settle();

    expect(store.language()).toBe('en');
    // brought back, not chosen: nothing is written for the member
    expect(localStorage.getItem(`${STORAGE_KEY}.Borys`)).toBeNull();

    owner.set('Aurelia');
    await settle();

    expect(store.language()).toBe('pl');
    expect(document.documentElement.lang).toBe('pl');
  });

  // the registry spelled the name anew (`borys` to `Borys`): the same person, the same choice
  it('keeps the language of a member whose name is spelled anew', async () => {
    owner.set('borys');
    const store = create({ members: { borys: 'pl' } });
    await store.restore();
    await settle();

    owner.set('Borys');
    await settle();

    expect(store.language()).toBe('pl');
    expect(localStorage.getItem(`${STORAGE_KEY}.Borys`)).toBe('pl');
    localStorage.removeItem(`${STORAGE_KEY}.borys`);
  });

  // the application can change hands while the texts are on their way
  it('remembers a choice for who made it when somebody else takes over before it arrives', async () => {
    const download = new Subject<Messages>();
    owner.set('Aurelia');
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: LANGUAGE_OWNER, useValue: owner },
        {
          provide: MESSAGES_LOADER,
          useValue: (language: LanguageCode) => (language === 'en' ? of(en) : download),
        },
      ],
    });
    const store = TestBed.inject(LanguageStore);
    await settle();

    const chosen = store.select('pl');
    owner.set('Borys');
    await settle();
    download.next(pl);
    download.complete();
    await chosen;

    expect(store.language()).toBe('en');
    expect(localStorage.getItem(`${STORAGE_KEY}.Aurelia`)).toBe('pl');
    expect(localStorage.getItem(`${STORAGE_KEY}.Borys`)).toBeNull();
  });

  it('keeps the language on screen when the next member chose the same', async () => {
    const store = create({ device: 'pl' });
    await store.restore();
    await settle();

    owner.set('Borys');
    await settle();

    expect(store.language()).toBe('pl');
  });
});

describe('the real loader of the texts', () => {
  afterEach(() => localStorage.removeItem(STORAGE_KEY));

  it('serves the real Polish file, not a copy made for a test', async () => {
    TestBed.configureTestingModule({ providers: [provideI18nTesting()] });
    const store = TestBed.inject(LanguageStore);

    expect(await store.select('pl')).toBe(true);

    expect(TestBed.inject(TranslocoService).translate('overview.heating.title')).toBe(
      pl.overview.heating.title,
    );
  });
});
