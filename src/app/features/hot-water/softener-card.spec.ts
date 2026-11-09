import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { FakeResource, answer, fakeResource, fail } from '../../../testing/fake-resource';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { Softener, SoftenerApi, SoftenerLive } from '../../data-access/water/softener-api';
import { SOFTENER_READ_AFTER_MS, SoftenerCard } from './softener-card';

const words = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('SoftenerCard', () => {
  let softener: FakeResource<Softener>;
  let fixture: ComponentFixture<SoftenerCard>;
  let regenerated: string[];
  let cancelled: number;
  let commandAnswer: Observable<void>;
  let liveOpened: number;
  let liveClosed: number;
  let liveAnswer: Observable<SoftenerLive>;

  beforeEach(() => {
    softener = fakeResource();
    regenerated = [];
    cancelled = 0;
    commandAnswer = of(undefined);
    liveOpened = 0;
    liveClosed = 0;
    liveAnswer = of({ live: true, liveUntil: '2026-11-09T10:05:00' });
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        {
          provide: SoftenerApi,
          useValue: {
            watchSoftener: () => softener,
            regenerate: (when: string) => {
              regenerated.push(when);
              return commandAnswer;
            },
            cancelRegeneration: () => {
              cancelled++;
              return commandAnswer;
            },
            openLive: () => {
              liveOpened++;
              return liveAnswer;
            },
            closeLive: () => {
              liveClosed++;
              return of(undefined);
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(SoftenerCard);
  });

  afterEach(() => vi.useRealTimers());

  async function card(): Promise<HTMLElement> {
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).querySelector('[data-testid="softener"]')!;
  }

  const row = async (id: string) => words((await card()).querySelector(`[data-testid="${id}"] dd`));
  const button = async (id: string) =>
    (await card()).querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);

  it('shows the salt, the water, the hardness and the regeneration', async () => {
    answer(softener, {
      online: true,
      measuredAt: '2026-11-09T10:00:00',
      water: { usedTodayLitres: 102, averageDailyLitres: 503, treatedAvailableLitres: 2218, flowLitresPerMinute: 0 },
      salt: { levelPercent: 25, daysLeft: 73, outOfSaltDate: '2027-01-21' },
      regeneration: { lastAt: '2026-11-09', total: 156, status: 'none' },
      hardnessGpg: 12,
      hardnessMgCaco3: 205.4,
      alerts: { lowSalt: false, leak: false, excessiveWaterUse: false, shutoffValve: false, resin: false, error: false },
    });

    expect(await row('softener-salt-days')).toBe('73 days');
    expect(await row('softener-salt-date')).toBe('21 January 2027');
    expect(await row('softener-used-today')).toBe('102 l');
    expect(await row('softener-treated')).toBe('2,218 l');
    expect(await row('softener-hardness')).toBe('205 mg/l CaCO₃');
    expect(await row('softener-regeneration-count')).toBe('156');
    expect(words((await card()).querySelector('[data-testid="softener-regeneration-state"]'))).toBe(
      'No regeneration planned',
    );
  });

  // missing is never zero or off
  it('says not known for what the answer leaves out, and never reads a missing flag as clear', async () => {
    answer(softener, { salt: { levelPercent: 40 }, alerts: { leak: true } });

    expect(await row('softener-salt-days')).toBe('not known');
    expect(await row('softener-used-today')).toBe('not known');
    expect(await row('softener-flow')).toBe('not known');
    const flags = (await card()).querySelectorAll('[data-testid="softener-flags"] li');
    const leak = [...flags].find((flag) => flag.getAttribute('data-flag') === 'leak')!;
    const salt = [...flags].find((flag) => flag.getAttribute('data-flag') === 'lowSalt')!;
    expect(leak.classList).toContain('softener__flag--raised');
    expect(salt.classList).toContain('softener__flag--unknown');
    expect(words(salt)).toContain('not known');
  });

  it('warns when the salt is low', async () => {
    answer(softener, { salt: { levelPercent: 10 } });

    expect(words((await card()).querySelector('[data-testid="softener-salt-low"]'))).toBe(
      'warning Little salt left - refill it soon.',
    );
  });

  // a regeneration only after a question, the softener read again whatever the command came to
  it('asks before a regeneration tonight, sends it once and reads the softener again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    answer(softener, { salt: { levelPercent: 40 }, regeneration: { status: 'none' } });
    const refresh = vi.spyOn(softener, 'refresh');

    (await button('softener-tonight'))!.click();
    expect(words((await card()).querySelector('legend'))).toBe('Schedule a regeneration for tonight?');
    expect(regenerated).toEqual([]);
    (await button('softener-confirm'))!.click();
    await fixture.whenStable();

    expect(regenerated).toEqual(['tonight']);
    await vi.advanceTimersByTimeAsync(SOFTENER_READ_AFTER_MS);
    expect(refresh).toHaveBeenCalled();
  });

  it('offers the cancel while a regeneration is scheduled, and nothing while one goes on', async () => {
    answer(softener, { salt: { levelPercent: 40 }, regeneration: { status: 'scheduled' } });
    expect(await button('softener-cancel')).toBeTruthy();
    expect(await button('softener-tonight')).toBeNull();

    answer(softener, { salt: { levelPercent: 40 }, regeneration: { status: 'regenerating' } });
    expect(await button('softener-now')).toBeNull();
    expect(await button('softener-cancel')).toBeNull();
  });

  // the codes of the commands worded in both languages
  it('words a refused command by its code, in English and in Polish', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    commandAnswer = throwError(
      () => new ApiError('client', 409, [{ message: 'Command too soon', code: 'COMMAND_TOO_SOON' }]),
    );
    answer(softener, { salt: { levelPercent: 40 }, regeneration: { status: 'scheduled' } });

    (await button('softener-cancel'))!.click();
    await fixture.whenStable();
    (await button('softener-confirm'))!.click();
    await vi.advanceTimersByTimeAsync(SOFTENER_READ_AFTER_MS);

    expect(cancelled).toBe(1);
    expect(words(await card())).toContain('A command was sent to the softener less than a minute ago');
    vi.useRealTimers();
    await useLanguage('pl');
    expect(words(await card())).toContain('Polecenie do zmiękczacza wysłano mniej niż minutę temu');
  });

  it('opens the live flow on the switch, holds it open and closes it on the switch off', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    answer(softener, { salt: { levelPercent: 40 } });

    (await card()).querySelector<HTMLButtonElement>('[data-testid="softener-live"] button')!.click();
    await fixture.whenStable();
    expect(liveOpened).toBe(1);
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(liveOpened).toBe(2);

    (await card()).querySelector<HTMLButtonElement>('[data-testid="softener-live"] button')!.click();
    await fixture.whenStable();
    expect(liveClosed).toBe(1);
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(liveOpened).toBe(2);
  });

  it('closes the live flow with the page', async () => {
    answer(softener, { salt: { levelPercent: 40 } });
    (await card()).querySelector<HTMLButtonElement>('[data-testid="softener-live"] button')!.click();
    await fixture.whenStable();

    fixture.destroy();

    expect(liveClosed).toBe(1);
  });

  it('words the throttle of the cloud when the live flow does not open', async () => {
    liveAnswer = throwError(
      () => new ApiError('client', 429, [{ message: 'Live stream throttled', code: 'LIVE_THROTTLED' }]),
    );
    answer(softener, { salt: { levelPercent: 40 } });

    (await card()).querySelector<HTMLButtonElement>('[data-testid="softener-live"] button')!.click();

    expect(words(await card())).toContain('The iQua cloud limits the live flow - try again later.');
    expect(liveClosed).toBe(0);
  });

  it('words a softener not read yet by its code', async () => {
    fail(
      softener,
      new ApiError('server', 503, [{ message: 'Water softener unavailable', code: 'SOFTENER_UNAVAILABLE' }]),
    );

    expect(words(await card())).toContain('The softener has not been read from the iQua cloud yet.');
  });
});
