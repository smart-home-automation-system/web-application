import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';

import { provideI18nTesting } from '../../../testing/i18n';
import { en } from '../../i18n/en';
import { pl } from '../../i18n/pl';
import { LanguageStore } from './language-store';
import { LanguageCode, MESSAGES_LOADER } from './languages';

const STORAGE_KEY = 'smart-home.language';

describe('LanguageStore', () => {
  function create(stored?: string): LanguageStore {
    TestBed.configureTestingModule({ providers: [provideI18nTesting()] });
    if (stored !== undefined) {
      localStorage.setItem(STORAGE_KEY, stored);
    }
    return TestBed.inject(LanguageStore);
  }

  function translate(key: string): string {
    return TestBed.inject(TranslocoService).translate(key);
  }

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    document.documentElement.lang = 'en';
  });

  it('starts in English, whatever the language of the browser', async () => {
    const browserLanguage = vi.spyOn(navigator, 'language', 'get').mockReturnValue('pl-PL');

    const store = create();
    await store.restore();

    expect(store.language()).toBe('en');
    expect(store.locale()).toBe('en-GB');
    expect(translate('nav.overview')).toBe('Overview');
    expect(document.documentElement.lang).toBe('en');
    browserLanguage.mockRestore();
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
    const store = create('pl');

    await store.restore();

    expect(store.language()).toBe('pl');
    expect(translate('nav.about')).toBe('O aplikacji');
  });

  it.each(['de', '', 'PL', '{"lang":"pl"}'])('ignores a stored value of "%s"', async (stored) => {
    const store = create(stored);

    await store.restore();

    expect(store.language()).toBe('en');
  });

  it('switches back to English', async () => {
    const store = create('pl');
    await store.restore();

    await store.select('en');

    expect(store.language()).toBe('en');
    expect(translate('nav.overview')).toBe('Overview');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('en');
  });

  describe('when the texts cannot be fetched', () => {
    function createWithFailingDownload(stored?: string): LanguageStore {
      TestBed.configureTestingModule({
        providers: [
          provideI18nTesting(),
          {
            provide: MESSAGES_LOADER,
            useValue: (language: LanguageCode) =>
              language === 'en' ? Promise.resolve(en) : Promise.reject(new Error('chunk is gone')),
          },
        ],
      });
      if (stored !== undefined) {
        localStorage.setItem(STORAGE_KEY, stored);
      }
      return TestBed.inject(LanguageStore);
    }

    beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
    afterEach(() => vi.restoreAllMocks());

    it('stays in the current language and does not remember the failed choice', async () => {
      const store = createWithFailingDownload();

      expect(await store.select('pl')).toBe(false);

      expect(store.language()).toBe('en');
      expect(translate('nav.overview')).toBe('Overview');
      expect(document.documentElement.lang).toBe('en');
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('starts in English when the stored language cannot be loaded', async () => {
      const store = createWithFailingDownload('pl');

      await store.restore();

      expect(store.language()).toBe('en');
    });
  });

  it('works without storage: the choice then lasts as long as the page', async () => {
    const store = create();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(await store.select('pl')).toBe(true);

    expect(store.language()).toBe('pl');
    vi.restoreAllMocks();
  });

  it('serves the real Polish texts, not a copy made for the test', async () => {
    const store = create();

    await store.select('pl');

    expect(translate('overview.heating.title')).toBe(pl.overview.heating.title);
  });
});
