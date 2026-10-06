import { TestBed } from '@angular/core/testing';

import { ThemeStore } from './theme-store';

const STORAGE_KEY = 'smart-home.theme';

describe('ThemeStore', () => {
  const root = document.documentElement;
  let systemDark: boolean;
  let schemeListeners: ((event: MediaQueryListEvent) => void)[];

  function create(stored?: string): ThemeStore {
    if (stored !== undefined) {
      localStorage.setItem(STORAGE_KEY, stored);
    }
    return TestBed.inject(ThemeStore);
  }

  /** The system switches between light and dark, as at sunset on a phone. */
  function switchSystem(dark: boolean): void {
    systemDark = dark;
    schemeListeners.forEach((listener) => listener({ matches: dark } as MediaQueryListEvent));
  }

  function meta(name: string): string | null | undefined {
    return document.head.querySelector(`meta[name="${name}"]`)?.getAttribute('content');
  }

  beforeEach(() => {
    systemDark = false;
    schemeListeners = [];
    // the DOM of the unit tests has no matchMedia
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return systemDark;
      },
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
        schemeListeners.push(listener),
      removeEventListener: () => undefined,
    }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 12));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.removeItem(STORAGE_KEY);
    root.removeAttribute('data-season');
    root.removeAttribute('data-color-scheme');
    document.head
      .querySelectorAll('meta[name="color-scheme"], meta[name="theme-color"]')
      .forEach((tag) => tag.remove());
  });

  it('takes the season from the calendar and tells the styles at once', () => {
    const store = create();

    expect(store.season()).toBe('autumn');
    expect(store.seasonChoice()).toBe('auto');
    expect(root.getAttribute('data-season')).toBe('autumn');
  });

  describe('when the day changes while the application stays open', () => {
    it('moves to the next season at midnight', () => {
      vi.setSystemTime(new Date(2026, 8, 22, 23, 59, 50));
      const store = create();
      expect(store.season()).toBe('summer');

      vi.advanceTimersByTime(9_000);
      expect(store.season()).toBe('summer');

      vi.advanceTimersByTime(3_000);
      TestBed.tick();

      expect(store.season()).toBe('autumn');
      expect(root.getAttribute('data-season')).toBe('autumn');
    });

    it('keeps watching, midnight after midnight', () => {
      vi.setSystemTime(new Date(2026, 11, 20, 12));
      const store = create();
      expect(store.season()).toBe('autumn');

      vi.advanceTimersByTime(24 * 3_600_000);
      expect(store.season()).toBe('autumn');

      vi.advanceTimersByTime(24 * 3_600_000);

      expect(store.season()).toBe('winter');
    });

    // a sleeping tablet runs no timers: the clock has moved on, the timer has not fired
    it('catches up when the tab comes back into view', () => {
      vi.setSystemTime(new Date(2026, 5, 21, 20));
      const store = create();
      expect(store.season()).toBe('spring');

      vi.setSystemTime(new Date(2026, 5, 25, 8));
      document.dispatchEvent(new Event('visibilitychange'));

      expect(store.season()).toBe('summer');
    });

    it('leaves a season chosen by hand alone', () => {
      vi.setSystemTime(new Date(2026, 8, 22, 23, 59, 50));
      const store = create();
      store.chooseSeason('spring');

      vi.advanceTimersByTime(15_000);

      expect(store.season()).toBe('spring');
      expect(store.calendarSeason()).toBe('autumn');
    });
  });

  describe('the colour scheme', () => {
    it('follows the system, and leaves the choice to the browser', () => {
      const store = create();

      expect(store.scheme()).toBe('light');
      expect(root.hasAttribute('data-color-scheme')).toBe(false);
      expect(meta('color-scheme')).toBe('light dark');

      switchSystem(true);

      expect(store.scheme()).toBe('dark');
      expect(root.hasAttribute('data-color-scheme')).toBe(false);
    });

    it('can be overridden, whatever the system says', () => {
      const store = create();

      store.chooseScheme('dark');
      TestBed.tick();

      expect(store.scheme()).toBe('dark');
      expect(root.getAttribute('data-color-scheme')).toBe('dark');
      expect(meta('color-scheme')).toBe('dark');

      switchSystem(true);
      store.chooseScheme('light');
      TestBed.tick();

      expect(store.scheme()).toBe('light');
      expect(root.getAttribute('data-color-scheme')).toBe('light');
    });
  });

  describe('a choice made by hand', () => {
    it('changes the colours and is remembered', () => {
      const store = create();

      store.chooseSeason('winter');
      TestBed.tick();

      expect(store.season()).toBe('winter');
      expect(store.overridden()).toBe(true);
      expect(root.getAttribute('data-season')).toBe('winter');
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
        season: 'winter',
        scheme: 'system',
      });
    });

    it('is back at the next start', () => {
      const store = create('{"season":"spring","scheme":"dark"}');

      expect(store.season()).toBe('spring');
      expect(store.scheme()).toBe('dark');
      expect(root.getAttribute('data-season')).toBe('spring');
      expect(root.getAttribute('data-color-scheme')).toBe('dark');
    });

    it('is forgotten on reset: the calendar and the system decide again', () => {
      const store = create('{"season":"spring","scheme":"dark"}');

      store.reset();
      TestBed.tick();

      expect(store.season()).toBe('autumn');
      expect(store.scheme()).toBe('light');
      expect(store.overridden()).toBe(false);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(root.hasAttribute('data-color-scheme')).toBe(false);
    });

    it.each([
      'not json',
      'null',
      '"winter"',
      '[]',
      '{"season":"monsoon","scheme":"sepia"}',
      '{"season":"auto","scheme":"system"}',
    ])('ignores a stored value of %s', (stored) => {
      const store = create(stored);

      expect(store.seasonChoice()).toBe('auto');
      expect(store.schemeChoice()).toBe('system');
    });

    it('keeps the half of a stored value that is valid', () => {
      const store = create('{"season":"summer","scheme":7}');

      expect(store.seasonChoice()).toBe('summer');
      expect(store.schemeChoice()).toBe('system');
    });

    it('works without storage: the choice then lasts as long as the page', () => {
      const store = create();
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });

      store.chooseSeason('summer');

      expect(store.season()).toBe('summer');
    });
  });

  describe('the colour of the status bar', () => {
    function stubBar(colours: Record<string, string>): void {
      vi.spyOn(window, 'getComputedStyle').mockImplementation(
        () =>
          ({
            getPropertyValue: (name: string) =>
              colours[`${root.getAttribute('data-season')} ${name}`] ?? '',
          }) as CSSStyleDeclaration,
      );
    }

    it('is the app bar of the season and scheme on screen', () => {
      stubBar({
        'autumn --app-bar-light': ' #bf360c',
        'autumn --app-bar-dark': '#8f2a0a',
        'winter --app-bar-dark': '#0d47a1',
      });
      const store = create();
      expect(meta('theme-color')).toBe('#bf360c');

      store.chooseScheme('dark');
      TestBed.tick();
      expect(meta('theme-color')).toBe('#8f2a0a');

      store.chooseSeason('winter');
      TestBed.tick();
      expect(meta('theme-color')).toBe('#0d47a1');
    });

    it('is left alone where the styles do not say', () => {
      create();

      expect(meta('theme-color')).toBeUndefined();
    });
  });
});
