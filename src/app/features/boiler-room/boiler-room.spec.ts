import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { BoilerApi, BoilerDeviceStatus, BoilerStatus } from '../../data-access/boiler/boiler-api';
import { toDeviceView } from './boiler-device';
import { BoilerRoom } from './boiler-room';

/** 8 October 2026, 11:05:00 on the clocks of the house (Europe/Warsaw, summer time). */
const NOW = Date.parse('2026-10-08T09:05:00Z');

const note = (message: string, timestamp: string) => ({ message, timestamp });

/** The furnace burns for the heating; the hot-water pump stands. */
const HEATING_THE_HOUSE: BoilerStatus = {
  furnace: {
    working: true,
    lastMessageReply: note('Furnace status updated', '2026-10-08T11:04:40.596721712'),
  },
  pumps: {
    hot_water: {
      working: false,
      lastMessageReply: note('Pump status updated', '2026-10-08T11:04:40.363176145'),
    },
    heating: {
      working: true,
      lastMessageReply: note('Pump state changed to: true', '2026-10-08T11:02:00'),
    },
  },
};

describe('BoilerRoom', () => {
  const value = signal<BoilerStatus | undefined>(undefined);
  const error = signal<ApiError | undefined>(undefined);
  const loading = signal(true);
  const stale = signal(false);
  const lastUpdated = signal<number | undefined>(undefined);
  let fixture: ComponentFixture<BoilerRoom>;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    value.set(undefined);
    error.set(undefined);
    loading.set(true);
    stale.set(false);
    lastUpdated.set(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        {
          provide: BoilerApi,
          useValue: {
            watchStatus: () => ({
              value,
              error,
              loading,
              stale,
              lastUpdated,
              refresh: () => undefined,
            }),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(BoilerRoom);
  });

  afterEach(() => vi.useRealTimers());

  function answer(status: BoilerStatus): void {
    value.set(status);
    loading.set(false);
    lastUpdated.set(Date.now());
  }

  const words = (element: Element | null) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function page(): Promise<HTMLElement> {
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  type Part = 'furnace' | 'hot-water-pump' | 'heating-pump';

  async function part(name: Part): Promise<HTMLElement> {
    return (await page()).querySelector(`[data-testid="${name}"]`)!;
  }

  async function pipes(): Promise<Record<string, boolean>> {
    const all = [...(await page()).querySelectorAll('.pipe')];
    return Object.fromEntries(
      all.map((pipe) => [
        [...pipe.classList].find((name) => name.startsWith('pipe--to-'))!.replace('pipe--to-', ''),
        pipe.classList.contains('pipe--flowing'),
      ]),
    );
  }

  it('shows a progress bar until the first answer, and no schematic', async () => {
    const shown = await page();

    expect(shown.querySelector('mat-progress-bar')).toBeTruthy();
    expect(shown.querySelector('.schematic')).toBeNull();
  });

  // only what the service reports: no boxes for the tank and the circuits behind the pumps
  it('draws the furnace and its two pumps, and nothing else', async () => {
    answer(HEATING_THE_HOUSE);

    const names = [...(await page()).querySelectorAll('.schematic h3')].map(words);

    expect(names).toEqual(['Furnace', 'Hot-water pump', 'Heating pump']);
    expect((await page()).querySelector('.schematic')?.getAttribute('aria-label')).toBe(
      'Schematic of the boiler room',
    );
  });

  describe('a device', () => {
    beforeEach(() => answer(HEATING_THE_HOUSE));

    it('says in words whether it runs: a furnace is on, a pump runs', async () => {
      expect(words((await part('furnace')).querySelector('.device__state'))).toBe('On');
      expect(words((await part('heating-pump')).querySelector('.device__state'))).toBe('Running');
      expect(words((await part('hot-water-pump')).querySelector('.device__state'))).toBe('Stopped');
    });

    it('is tinted while it runs', async () => {
      expect((await part('furnace')).classList).toContain('device--working');
      expect((await part('heating-pump')).classList).toContain('device--working');
      expect((await part('hot-water-pump')).classList).not.toContain('device--working');
    });

    it('shows the last thing the service noted about it, and how long ago', async () => {
      const pump = await part('heating-pump');

      expect(words(pump.querySelector('.device__message'))).toBe('Pump state changed to: true');
      // 11:02:00 on the clocks of the house, read at 11:05:00 - whatever the zone of this machine
      expect(words(pump.querySelector('.device__age'))).toBe('3 min ago');
      expect(words((await part('furnace')).querySelector('.device__age'))).toBe('20 sec ago');
    });

    it('lets the age move with the clock', async () => {
      expect(words((await part('heating-pump')).querySelector('.device__age'))).toBe('3 min ago');

      // the shared clock of the application ticks every five seconds
      vi.advanceTimersByTime(120_000);

      expect(words((await part('heating-pump')).querySelector('.device__age'))).toBe('5 min ago');
    });
  });

  // text from outside: printed as it is, never through the translations
  it('prints what the service said untouched, placeholders and markup included', async () => {
    answer({
      furnace: {
        working: false,
        lastMessageReply: note('{{ message }} <b>hot</b>', '2026-10-08T11:04:40'),
      },
    });

    const message = (await part('furnace')).querySelector('.device__message')!;

    expect(message.textContent).toBe('{{ message }} <b>hot</b>');
    expect(message.querySelector('b')).toBeNull();
  });

  describe('the pipes', () => {
    it('are drawn as flowing along the pump that runs', async () => {
      answer(HEATING_THE_HOUSE);

      expect(await pipes()).toEqual({ 'hot-water-pump': false, 'heating-pump': true });
    });

    // a wide screen draws one pipe out of the furnace that forks: each branch follows its pump,
    // the stub before the fork whichever of them runs
    it.each([
      ['only the heating pump', { hot_water: false, heating: true }, [true, false, true]],
      ['only the hot-water pump', { hot_water: true, heating: false }, [true, true, false]],
      ['both pumps', { hot_water: true, heating: true }, [true, true, true]],
      ['neither pump', { hot_water: false, heating: false }, [false, false, false]],
    ])('draw the fork out of the furnace for %s', async (_, running, expected) => {
      answer({
        furnace: { working: true },
        pumps: {
          hot_water: { working: running.hot_water },
          heating: { working: running.heating },
        },
      });

      const shown = await page();
      const flowing = ['.manifold__stub', '.manifold__branch--up', '.manifold__branch--down'].map(
        (selector) => shown.querySelector(selector)!.classList.contains('manifold--flowing'),
      );

      expect(flowing).toEqual(expected);
      // a drawing of what the boxes already say in words
      expect(shown.querySelector('.manifold')?.getAttribute('aria-hidden')).toBe('true');
    });

    // a pump moves the water whether or not the furnace burns
    it('follow the pump alone, also while the furnace is off', async () => {
      answer({
        furnace: { working: false },
        pumps: { hot_water: { working: true }, heating: { working: false } },
      });

      expect(await pipes()).toEqual({ 'hot-water-pump': true, 'heating-pump': false });
    });
  });

  describe('before the service has looked at the devices', () => {
    it('shows them as off, with nothing noted', async () => {
      answer({
        furnace: { working: false },
        pumps: { hot_water: { working: false }, heating: { working: false } },
      });

      const furnace = await part('furnace');

      expect(words(furnace.querySelector('.device__state'))).toBe('Off');
      expect(furnace.querySelector('.device__message')).toBeNull();
      expect(furnace.querySelector('.device__age')).toBeNull();
      expect(Object.values(await pipes())).toEqual([false, false]);
    });

    // JSON that is not the model must not read as "everything is off"
    it.each([
      ['an empty answer', {}],
      ['devices without a state', { furnace: {}, pumps: { hot_water: {}, heating: {} } }],
      ['pumps missing', { furnace: { working: 'yes' } }],
    ])('says "no status yet" for %s', async (_, body) => {
      answer(body as BoilerStatus);

      for (const name of ['furnace', 'hot-water-pump', 'heating-pump'] as const) {
        const device = await part(name);
        expect(words(device.querySelector('.device__state')), name).toBe('No status yet');
        expect(device.getAttribute('data-state'), name).toBe('unknown');
        expect(device.classList, name).not.toContain('device--working');
      }
      // ...and no pipe of a pump of unknown state is drawn as flowing
      expect(Object.values(await pipes())).toEqual([false, false]);
      expect((await page()).querySelectorAll('.manifold--flowing')).toHaveLength(0);
    });

    // a 200 without a body: the service answered, and said nothing
    it('draws the schematic with nothing known for an answer without a body', async () => {
      answer(null as unknown as BoilerStatus);

      const shown = await page();

      expect(shown.querySelector('.schematic')).toBeTruthy();
      expect(words((await part('furnace')).querySelector('.device__state'))).toBe('No status yet');
      expect(shown.querySelector('[role="alert"]')).toBeNull();
    });

    it('tells a pump of unknown state from one that stands', async () => {
      answer({ furnace: { working: true }, pumps: { hot_water: { working: false } } });

      expect(words((await part('hot-water-pump')).querySelector('.device__state'))).toBe('Stopped');
      expect(words((await part('heating-pump')).querySelector('.device__state'))).toBe(
        'No status yet',
      );
    });
  });

  describe('when the call fails', () => {
    it('says why, in place of the schematic, when there never was an answer', async () => {
      error.set(new ApiError('server', 502));
      loading.set(false);
      stale.set(true);

      const shown = await page();

      expect(words(shown.querySelector('[role="alert"]'))).toContain(
        'The service is not available right now (error 502).',
      );
      expect(shown.querySelector('.schematic')).toBeNull();
    });

    it('keeps the last state on screen next to the failure, marked as out of date', async () => {
      answer(HEATING_THE_HOUSE);
      error.set(new ApiError('network', 0));
      stale.set(true);

      const shown = await page();

      expect(shown.querySelector('.schematic')).toBeTruthy();
      expect(words(shown.querySelector('[role="alert"]'))).toContain(
        'The server cannot be reached.',
      );
      expect(shown.querySelector('app-data-freshness')?.classList).toContain('freshness--stale');
    });
  });

  it('speaks Polish - except for what the service said', async () => {
    answer(HEATING_THE_HOUSE);
    await useLanguage('pl');

    const shown = await page();

    expect(words(shown.querySelector('h1'))).toBe('Kotłownia');
    expect([...shown.querySelectorAll('.schematic h3')].map(words)).toEqual([
      'Piec',
      'Pompa ciepłej wody',
      'Pompa ogrzewania',
    ]);
    const pump = await part('heating-pump');
    expect(words(pump.querySelector('.device__state'))).toBe('Pracuje');
    expect(words(pump.querySelector('.device__message'))).toBe('Pump state changed to: true');
    expect(words(pump.querySelector('.device__age'))).toBe('3 min temu');
  });
});

describe('toDeviceView', () => {
  it('reads a device as the service sends it', () => {
    expect(
      toDeviceView({
        working: true,
        lastMessageReply: note('Furnace status updated', '2026-10-08T11:02:41.596721712'),
      }),
    ).toEqual({
      working: true,
      message: 'Furnace status updated',
      at: '2026-10-08T11:02:41.596721712',
    });
  });

  it('reads a device nothing is noted about', () => {
    expect(toDeviceView({ working: false })).toEqual({
      working: false,
      message: undefined,
      at: undefined,
    });
  });

  it.each([
    ['no device', undefined],
    ['null', null],
    ['a text', 'on'],
    ['a list', []],
    ['a flag that is a text', { working: 'true' }],
    ['a flag that is a number', { working: 1 }],
  ])('does not take %s for a device that is off', (_, device) => {
    expect(toDeviceView(device as BoilerDeviceStatus | undefined).working).toBeUndefined();
  });

  it.each([
    ['a note that is a text', { working: true, lastMessageReply: 'fine' }],
    ['a note without its parts', { working: true, lastMessageReply: {} }],
    ['an empty message', { working: true, lastMessageReply: { message: '', timestamp: 5 } }],
  ])('keeps the state and drops %s', (_, device) => {
    expect(toDeviceView(device as BoilerDeviceStatus)).toEqual({
      working: true,
      message: undefined,
      at: undefined,
    });
  });
});
