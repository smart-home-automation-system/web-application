import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../api/api-error';
import { ConnectionStore } from '../api/connection-store';
import { ProfileStore } from '../profile/profile-store';
import { AppUpdate } from '../pwa/app-update';
import { ASK_AGAIN_MS, Notices } from './notices';

const STORAGE_KEY = 'smart-home.last-contact';
const NOON = new Date(2026, 9, 8, 12, 0).getTime();
const NO_ANSWER = new ApiError('network', 0);

describe('Notices', () => {
  let fixture: ComponentFixture<Notices>;
  let connection: ConnectionStore;
  const asking = signal(false);
  const refresh = vi.fn(() => Promise.resolve(true));
  const newVersion = signal(false);
  const reload = vi.fn();

  function create(): void {
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: ProfileStore, useValue: { loading: asking, refresh } },
        { provide: AppUpdate, useValue: { available: newVersion, reload } },
      ],
    });
    connection = TestBed.inject(ConnectionStore);
    fixture = TestBed.createComponent(Notices);
  }

  /** Two calls in a row without an answer: the house is out of reach. */
  function cutOff(): void {
    connection.failed(NO_ANSWER, Date.now());
    connection.failed(NO_ANSWER, Date.now());
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function notice(name: 'offline' | 'update'): HTMLElement | null {
    return host().querySelector(`[data-testid="${name}-notice"]`);
  }

  function text(element: HTMLElement | null): string {
    return (element?.querySelector('.notice__text')?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function time(instant: number, options: Intl.DateTimeFormatOptions, locale = 'en-GB'): string {
    return new Intl.DateTimeFormat(locale, options).format(instant);
  }

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    asking.set(false);
    newVersion.set(false);
    refresh.mockClear();
    reload.mockClear();
    // the timers of the component and the clock; Angular keeps its own scheduling
    vi.useFakeTimers({ now: NOON, toFake: ['setInterval', 'clearInterval', 'Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.removeItem(STORAGE_KEY);
  });

  // one service that hangs looks like this too, while the house is fine
  it('asks the house at once after a single call that got no answer, and shows nothing yet', async () => {
    create();
    connection.failed(NO_ANSWER, Date.now());
    await fixture.whenStable();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(notice('offline')).toBeNull();
  });

  it('says nothing, and takes no room, while there is nothing to say', async () => {
    create();
    await fixture.whenStable();

    expect(notice('offline')).toBeNull();
    expect(notice('update')).toBeNull();
    expect(host().children).toHaveLength(0);
  });

  it('is announced by a screen reader without taking the focus', async () => {
    create();
    await fixture.whenStable();

    expect(host().getAttribute('aria-live')).toBe('polite');
  });

  describe('while the house cannot be reached', () => {
    it('says so, with the time it last answered', async () => {
      create();
      connection.succeeded();
      vi.setSystemTime(NOON + 600_000);
      cutOff();
      await fixture.whenStable();

      expect(text(notice('offline'))).toBe(
        `No connection to the house. Check the Wi-Fi or VPN. Last contact: ${time(NOON, { timeStyle: 'short' })}`,
      );
    });

    it('adds the date once the last answer is of another day', async () => {
      localStorage.setItem(STORAGE_KEY, String(NOON - 86_400_000));
      create();
      cutOff();
      await fixture.whenStable();

      expect(text(notice('offline'))).toContain(
        `Last contact: ${time(NOON - 86_400_000, { dateStyle: 'medium', timeStyle: 'short' })}`,
      );
    });

    it('names no time when the house never answered in this browser', async () => {
      create();
      cutOff();
      await fixture.whenStable();

      expect(text(notice('offline'))).toBe('No connection to the house. Check the Wi-Fi or VPN.');
    });

    it('speaks Polish, with the time in the Polish format', async () => {
      localStorage.setItem(STORAGE_KEY, String(NOON - 86_400_000));
      create();
      await useLanguage('pl');
      cutOff();
      await fixture.whenStable();

      expect(text(notice('offline'))).toBe(
        `Brak połączenia z domem. Sprawdź Wi-Fi lub VPN. Ostatnie połączenie: ${time(
          NOON - 86_400_000,
          { dateStyle: 'medium', timeStyle: 'short' },
          'pl-PL',
        )}`,
      );
    });

    it('asks the house again on request', async () => {
      create();
      cutOff();
      await fixture.whenStable();

      notice('offline')!.querySelector('button')!.click();

      expect(refresh).toHaveBeenCalledTimes(1);
    });

    // a question on its way is shared; a button that switches off under the finger loses the focus
    it('keeps the button usable while an answer is on its way', async () => {
      create();
      cutOff();
      asking.set(true);
      await fixture.whenStable();

      expect(notice('offline')!.querySelector('button')!.disabled).toBe(false);
    });

    // a page without polling would otherwise keep the banner until somebody taps it
    it('asks again by itself every half a minute, while the page is in view', async () => {
      const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
      create();
      cutOff();
      await fixture.whenStable();

      vi.advanceTimersByTime(ASK_AGAIN_MS - 1);
      expect(refresh).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(refresh).toHaveBeenCalledTimes(1);

      visibility.mockReturnValue('hidden');
      vi.advanceTimersByTime(ASK_AGAIN_MS);
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('asks the moment the device is back online', async () => {
      create();
      cutOff();
      await fixture.whenStable();

      window.dispatchEvent(new Event('online'));

      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('goes with the first answer, and stops asking', async () => {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
      create();
      cutOff();
      await fixture.whenStable();

      connection.succeeded();
      await fixture.whenStable();

      expect(notice('offline')).toBeNull();
      vi.advanceTimersByTime(ASK_AGAIN_MS * 3);
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  it('asks nothing by itself while the house answers', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    create();
    await fixture.whenStable();

    vi.advanceTimersByTime(ASK_AGAIN_MS * 3);

    expect(refresh).not.toHaveBeenCalled();
  });

  describe('when a newer version is waiting', () => {
    it('says so and reloads on request', async () => {
      create();
      newVersion.set(true);
      await fixture.whenStable();

      expect(text(notice('update'))).toBe('A new version of the application is ready.');
      notice('update')!.querySelector('button')!.click();

      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('says so next to the missing connection, not instead of it', async () => {
      create();
      newVersion.set(true);
      cutOff();
      await fixture.whenStable();

      expect(notice('offline')).toBeTruthy();
      expect(notice('update')).toBeTruthy();
    });
  });
});
