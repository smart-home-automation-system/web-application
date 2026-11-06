import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FakeQueryResource, fakeQueryResource } from '../../../testing/fake-resource';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { houseTime } from '../../../mocks/house-time';
import { ApiError } from '../../core/api/api-error';
import { PollingResource } from '../../core/api/polling-resource';
import { HistoryRange } from '../../core/time/history-range';
import {
  CirculationRun,
  ConsumptionTotals,
  WaterApi,
  WaterCirculation,
  WaterHeatingDemand,
  WaterTemperatures,
  WaterValve,
} from '../../data-access/water/water-api';
import { Observable, of, throwError } from 'rxjs';

import { CIRCULATION_READ_AFTER_MS, HotWater, VALVE_READ_AFTER_MS } from './hot-water';

/** A polled resource whose every signal the test sets by hand. */
interface FakeResource<T> extends PollingResource<T> {
  readonly value: WritableSignal<T | undefined>;
  readonly error: WritableSignal<ApiError | undefined>;
  readonly loading: WritableSignal<boolean>;
  readonly stale: WritableSignal<boolean>;
  readonly lastUpdated: WritableSignal<number | undefined>;
}

function fakeResource<T>(): FakeResource<T> {
  return {
    value: signal<T | undefined>(undefined),
    error: signal<ApiError | undefined>(undefined),
    loading: signal(true),
    stale: signal(false),
    lastUpdated: signal<number | undefined>(undefined),
    refresh: () => Promise.resolve(),
  };
}

const NOTHING_MEASURED = 'No temperature has been measured yet.';

describe('HotWater', () => {
  let temperatures: FakeResource<WaterTemperatures | null>;
  let demand: FakeResource<WaterHeatingDemand>;
  let valve: FakeResource<WaterValve>;
  let totals: FakeResource<ConsumptionTotals>;
  let pump: FakeResource<WaterCirculation>;
  let runs: FakeQueryResource<HistoryRange, readonly CirculationRun[] | null>;
  let started: number;
  let startAnswer: Observable<void>;
  let commanded: string[];
  let commandAnswer: Observable<void>;
  let fixture: ComponentFixture<HotWater>;

  beforeEach(() => {
    temperatures = fakeResource();
    demand = fakeResource();
    valve = fakeResource();
    totals = fakeResource();
    pump = fakeResource();
    runs = fakeQueryResource();
    started = 0;
    startAnswer = of(undefined);
    commanded = [];
    commandAnswer = of(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        {
          provide: WaterApi,
          useValue: {
            watchTemperatures: () => temperatures,
            watchHeatingDemand: () => demand,
            // the history is a card of its own, with tests of its own (water-history.spec)
            watchHistory: () => fakeQueryResource(),
            watchValve: () => valve,
            watchConsumptionTotals: () => totals,
            // the bills are a card of their own, with tests of their own (water-bills.spec)
            watchBills: () => fakeResource(),
            commandValve: (state: 'open' | 'close') => {
              commanded.push(state);
              return commandAnswer;
            },
            // the consumption is a card of its own, with tests of its own (water-consumption.spec)
            watchConsumption: () => fakeQueryResource(),
            watchCirculation: () => pump,
            watchCirculationRuns: () => runs,
            startCirculation: () => {
              started++;
              return startAnswer;
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(HotWater);
  });

  function answer<T>(resource: FakeResource<T>, value: T): void {
    resource.value.set(value);
    resource.loading.set(false);
    resource.lastUpdated.set(Date.now());
  }

  function fail<T>(resource: FakeResource<T>, error: ApiError): void {
    resource.error.set(error);
    resource.loading.set(false);
    resource.stale.set(true);
  }

  /** A card of the page, or the reading inside the card of the tank or of the circulation. */
  async function part(
    name: 'temperatures' | 'demand' | 'circulation-card' | 'tank' | 'valve' | 'usage',
  ): Promise<HTMLElement | null> {
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${name}"]`);
  }

  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('shows a progress bar in each card until its call has answered', async () => {
    for (const name of ['temperatures', 'demand', 'circulation-card'] as const) {
      expect((await part(name))?.querySelector('mat-progress-bar'), name).toBeTruthy();
    }

    answer(demand, { active: false });

    expect((await part('demand'))?.querySelector('mat-progress-bar')).toBeNull();
    expect((await part('temperatures'))?.querySelector('mat-progress-bar')).toBeTruthy();
    expect((await part('circulation-card'))?.querySelector('mat-progress-bar')).toBeTruthy();
  });

  describe('the tank', () => {
    it('shows the temperature with one decimal and its unit', async () => {
      answer(temperatures, { water: { temperature: 44.75 }, circulation: { temperature: 29.81 } });

      expect(words(await part('tank'))).toBe('44.8 °C');
    });

    it('keeps the decimal of a whole number, so the reading does not change its width', async () => {
      answer(temperatures, { water: { temperature: 40 } });

      expect(words(await part('tank'))).toBe('40.0 °C');
    });

    it('draws the temperature against the band the water is kept in', async () => {
      answer(temperatures, { water: { temperature: 40.5 } });

      const gauge = (await part('temperatures'))!.querySelector('[role="meter"]')!;

      expect(gauge.getAttribute('aria-valuenow')).toBe('40.5');
      expect(gauge.getAttribute('aria-label')).toBe(
        'Temperature of the water against the band it is kept in',
      );
      expect(gauge.getAttribute('aria-valuetext')).toBe('40.5 °C; kept between 38 and 42 °C');
      expect([...gauge.querySelectorAll('.gauge__scale span')].map(words)).toEqual([
        '20 °C',
        '38–42 °C',
        '80 °C',
      ]);
    });

    it('says in words between which temperatures the water is heated', async () => {
      answer(temperatures, { water: { temperature: 40.5 } });

      expect(words(await part('temperatures'))).toContain(
        'Heated once it drops below 38 °C, until it is above 42 °C.',
      );
    });

    it('shows a temperature of zero as a reading, not as none', async () => {
      answer(temperatures, { water: { temperature: 0 } });

      expect(words(await part('tank'))).toBe('0.0 °C');
    });
  });

  // the owner's layout (2026-10-10): the tank alone in its card, the circulation under the demand - since HAS-406
  // the circulation card reads the pump, not the temperatures of the tank
  it('keeps the circulation in a card of its own, after that of the demand', async () => {
    answer(temperatures, { water: { temperature: 44.75 }, circulation: { temperature: 29.81 } });

    const card = (await part('circulation-card'))!;

    expect(words(card.querySelector('mat-card-title'))).toBe('Circulation');
    expect(words(await part('temperatures'))).not.toContain('29.8');
    expect((await part('demand'))!.nextElementSibling).toBe(card);
  });

  describe('before the first reading', () => {
    // water-service then answers 200 with no body at all
    it.each([
      ['an empty answer', null],
      ['an answer without the sensors', {}],
      ['an answer without the temperatures', { water: {}, circulation: {} }],
      [
        'temperatures that are not numbers',
        { water: { temperature: 'warm' }, circulation: { temperature: null } },
      ],
    ])('says in the card of the tank that nothing was measured yet, for %s', async (_, body) => {
      answer(temperatures, body as WaterTemperatures | null);

      const shown = (await part('temperatures'))!;

      expect(words(shown)).toContain(NOTHING_MEASURED);
      expect(await part('tank')).toBeNull();
      expect(shown.querySelector('[role="meter"]')).toBeNull();
      expect(shown.querySelector('[role="alert"]')).toBeNull();
    });

    it('shows the tank without a circulation temperature in the answer', async () => {
      answer(temperatures, { water: { temperature: 41 } });

      expect(words(await part('tank'))).toBe('41.0 °C');
      expect(words(await part('temperatures'))).not.toContain(NOTHING_MEASURED);
    });
  });

  describe('whether the water asks to be heated', () => {
    it('says that heating is needed', async () => {
      answer(demand, { active: true });

      const state = (await part('demand'))!.querySelector('.tile__state')!;

      expect(words(state)).toBe('mode_heat Heating needed');
      expect(state.classList).toContain('tile__state--on');
      // it stands out at a glance: the strip in the colour of the heating (owner, 2026-11-05)
      expect(state.classList).toContain('tile__state--heating');
    });

    it('says that the water is warm enough', async () => {
      answer(demand, { active: false });

      const state = (await part('demand'))!.querySelector('.tile__state')!;

      expect(words(state)).toBe('check_circle Warm enough');
      expect(state.classList).not.toContain('tile__state--on');
      expect((await part('demand'))!.querySelector('.tile__state--heating')).toBeNull();
    });

    // "warm enough" must be something the service said, never the reading of a missing field
    it.each([
      ['an answer without the flag', {}],
      ['a flag that is not one', { active: 'yes' }],
    ])('does not guess from %s', async (_, body) => {
      answer(demand, body as WaterHeatingDemand);

      const shown = (await part('demand'))!;

      expect(shown.querySelector('.tile__state')).toBeNull();
      expect(words(shown)).toContain('The service does not say whether the water needs heating.');
    });
  });

  describe('when a call fails', () => {
    // two readings of one call, each in a card of its own: each card explains itself
    it('says in the card of the tank why the temperatures are missing, and leaves the others alone', async () => {
      fail(temperatures, new ApiError('server', 502));
      answer(demand, { active: false });
      answer(pump, { running: false });
      await fixture.whenStable();

      const card = (await part('temperatures'))!;

      expect(words(card.querySelector('[role="alert"]'))).toContain(
        'The service is not available right now (error 502).',
      );
      // no reading and a failure: the failure is the explanation, not "nothing measured yet"
      expect(words(card)).not.toContain(NOTHING_MEASURED);
      expect((await part('demand'))!.querySelector('[role="alert"]')).toBeNull();
      expect((await part('circulation-card'))!.querySelector('[role="alert"]')).toBeNull();
    });

    it('keeps the last readings on screen next to the failure, marked as out of date', async () => {
      answer(temperatures, { water: { temperature: 44.75 }, circulation: { temperature: 29.81 } });
      fail(temperatures, new ApiError('network', 0));

      const shown = (await part('temperatures'))!;

      expect(words(await part('tank'))).toBe('44.8 °C');
      expect(words(shown.querySelector('[role="alert"]'))).toContain(
        'The server cannot be reached.',
      );
      expect(shown.querySelector('app-data-freshness')?.classList).toContain('freshness--stale');
    });

    it('says why the demand is not known', async () => {
      fail(demand, new ApiError('server', 503));

      const shown = (await part('demand'))!;

      expect(words(shown.querySelector('[role="alert"]'))).toContain('(error 503)');
      expect(words(shown)).not.toContain('does not say');
    });
  });

  // The service repeats its last row for as long as the sensor is silent, so the freshness of
  // the call says nothing about the reading: the card says when the sensors were read.
  describe('the age of the reading', () => {
    /** A local date-time of the house, to the second, some seconds ago - as the service sends it. */
    const measured = (secondsAgo: number) => houseTime(new Date(), secondsAgo).slice(0, 19);

    it('says when the sensors were read', async () => {
      answer(temperatures, { measuredAt: measured(125), water: { temperature: 46.81 } });

      const line = (await part('temperatures'))?.querySelector('[data-testid="measured"]');

      expect(words(line)).toMatch(/^Measured 2 min\.? ago$/);
      expect(line?.classList).not.toContain('tile__measured--old');
    });

    // two missed polls of the 3-minute cycle
    it('calls the reading out of date once the sensor was not read for more than 6 minutes', async () => {
      answer(temperatures, { measuredAt: measured(7 * 60 + 5), water: { temperature: 46.81 } });

      const line = (await part('temperatures'))?.querySelector('[data-testid="measured"]');

      expect(words(line)).toMatch(/Measured 7 min\.? ago - the sensor has not been read since\./);
      expect(line?.classList).toContain('tile__measured--old');
      // the reading itself stays: it is the last one there is
      expect(words(await part('tank'))).toBe('46.8 °C');
    });

    it('does not call a reading of five minutes out of date', async () => {
      answer(temperatures, { measuredAt: measured(5 * 60), water: { temperature: 46.81 } });

      const line = (await part('temperatures'))?.querySelector('[data-testid="measured"]');

      expect(line?.classList).not.toContain('tile__measured--old');
    });

    // a water-service below 0.6.0 sends no time: the age is not known, and not made up
    it('says nothing about the age of a reading the answer does not date', async () => {
      answer(temperatures, { water: { temperature: 46.81 } });

      expect((await part('temperatures'))?.querySelector('[data-testid="measured"]')).toBeNull();
    });

    it('says nothing for a time that is no date-time', async () => {
      answer(temperatures, { measuredAt: 'a moment ago', water: { temperature: 46.81 } });

      expect((await part('temperatures'))?.querySelector('[data-testid="measured"]')).toBeNull();
    });

    // the time of a reading says nothing without the reading
    it('says nothing while there is no temperature to date', async () => {
      answer(temperatures, { measuredAt: measured(60) });

      expect((await part('temperatures'))?.querySelector('[data-testid="measured"]')).toBeNull();
      expect(
        (await part('circulation-card'))?.querySelector('[data-testid="measured"]'),
      ).toBeNull();
    });
  });

  it('has the history of both temperatures as a card of its own', async () => {
    await fixture.whenStable();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="water-history"]'),
    ).toBeTruthy();
  });

  it('speaks Polish, with a decimal comma', async () => {
    answer(temperatures, { water: { temperature: 44.75 }, circulation: { temperature: 29.81 } });
    answer(demand, { active: true });
    await useLanguage('pl');

    const shown = (await part('temperatures'))!;

    expect(words((fixture.nativeElement as HTMLElement).querySelector('h1'))).toBe('Woda');
    expect(words(await part('tank'))).toBe('44,8 °C');
    expect(words((await part('circulation-card'))!.querySelector('mat-card-title'))).toBe(
      'Cyrkulacja',
    );
    expect(shown.querySelector('[role="meter"]')?.getAttribute('aria-valuetext')).toBe(
      '44,8 °C; utrzymywana między 38 a 42 °C',
    );
    expect(words((await part('demand'))!.querySelector('.tile__state'))).toContain(
      'Wymaga grzania',
    );
  });

  // HAS-322: the valve of the garage - what it reports, what the answer leaves out, its age
  describe('the water valve', () => {
    const house = (secondsAgo: number) => houseTime(new Date(), secondsAgo).slice(0, 19);

    it('shows the state, the flow, the pressure, the water temperature and the counter', async () => {
      answer(valve, {
        state: 'open',
        flowRate: 6.5,
        pressure: 4.92,
        temperature: 12.9,
        counter: { total: 61.896, measuredAt: house(30) },
        measuredAt: house(8),
      });
      answer(totals, {});

      const card = (await part('valve'))!;
      expect(words(card.querySelector('[data-testid="valve-state"]'))).toContain('Open');
      expect(words(card.querySelector('[data-testid="valve-flow"]'))).toBe('Flow 6.5 l/min');
      expect(words(card.querySelector('[data-testid="valve-pressure"]'))).toBe('Pressure 4.92 bar');
      expect(words(card.querySelector('[data-testid="valve-temperature"]'))).toBe(
        'Water temperature 12.9 °C',
      );
      expect(
        words((await part('usage'))!.querySelector('[data-testid="valve-usage-counter"]')),
      ).toBe('Counter, in all 61.896 m³');
      expect(card.querySelector('.tile__measured--old')).toBeNull();
    });

    // missing is never off: what the answer leaves out is not known - never closed, never zero
    it('says not known for what the answer leaves out', async () => {
      answer(valve, { pressure: 4.92, measuredAt: house(8) });
      answer(totals, {});

      const card = (await part('valve'))!;
      expect(words(card.querySelector('[data-testid="valve-state"]'))).toContain('State not known');
      expect(words(card.querySelector('[data-testid="valve-flow"]'))).toBe('Flow not known');
      expect(
        words((await part('usage'))!.querySelector('[data-testid="valve-usage-counter"]')),
      ).toBe('Counter, in all not known');
      expect(words(card)).not.toContain('Closed');
    });

    it('shows a closed valve without a flow as it is', async () => {
      answer(valve, { state: 'closed', flowRate: 0, measuredAt: house(8) });

      const card = (await part('valve'))!;
      expect(words(card.querySelector('[data-testid="valve-state"]'))).toContain('Closed');
      expect(words(card.querySelector('[data-testid="valve-flow"]'))).toBe('Flow 0.0 l/min');
    });

    it('says the valve is not heard once its newest report is older than 3 minutes', async () => {
      answer(valve, { state: 'open', measuredAt: house(181) });

      const measured = (await part('valve'))!.querySelector('[data-testid="valve-measured"]');
      expect(measured?.classList).toContain('tile__measured--old');
      expect(words(measured)).toContain('the valve has not been heard since');
    });

    it('says the valve has reported nothing for an empty answer', async () => {
      answer(valve, {});

      expect(words((await part('valve'))!.querySelector('[data-testid="valve-nothing"]'))).toBe(
        'The valve has reported nothing yet.',
      );
    });

    // the counter alone says little (owner, 2026-11-05): the water of today, this week, this month and this year
    it('shows the water of the running ranges in litres, a year in m³, and what is not known', async () => {
      answer(valve, { state: 'open', measuredAt: house(8) });
      answer(totals, { day: 0.271, week: 1.298, year: 104.356 });

      const card = (await part('usage'))!;
      expect(words(card.querySelector('[data-testid="valve-usage-day"]'))).toBe('Today 271 L');
      expect(words(card.querySelector('[data-testid="valve-usage-week"]'))).toBe(
        'This week 1,298 L',
      );
      expect(words(card.querySelector('[data-testid="valve-usage-month"]'))).toBe(
        'This month not known',
      );
      expect(words(card.querySelector('[data-testid="valve-usage-year"]'))).toBe(
        'This year 104.4 m³',
      );
    });

    // the water used is a card of its own (owner, 2026-11-05): its failure is told there, the valve still shown
    it('tells a failure of the totals in the card of the water used, the valve still shown', async () => {
      answer(valve, { state: 'open', measuredAt: house(8) });
      fail(totals, new ApiError('server', 502));

      expect(words((await part('valve'))!.querySelector('[data-testid="valve-state"]'))).toContain(
        'Open',
      );
      expect((await part('valve'))!.querySelectorAll('[role="alert"]')).toHaveLength(0);
      expect((await part('usage'))!.querySelectorAll('[role="alert"]')).toHaveLength(1);
    });

    // HAS-323: the one write that cuts the water of the whole house - offered as the change of the state, asked first
    describe('the command', () => {
      const button = async (name: string) =>
        (await part('valve'))!.querySelector(`[data-testid="${name}"]`) as HTMLButtonElement | null;

      it('offers to close an open valve, to open a closed one, and both while the state is not known', async () => {
        answer(valve, { state: 'open', measuredAt: house(8) });
        expect(await button('valve-close')).toBeTruthy();
        expect(await button('valve-open')).toBeNull();

        answer(valve, { state: 'closed', measuredAt: house(8) });
        expect(await button('valve-open')).toBeTruthy();
        expect(await button('valve-close')).toBeNull();

        answer(valve, { pressure: 4.9, measuredAt: house(8) });
        expect(await button('valve-close')).toBeTruthy();
        expect(await button('valve-open')).toBeTruthy();
      });

      it('asks before it closes the valve, and sends nothing for a cancel', async () => {
        answer(valve, { state: 'open', measuredAt: house(8) });

        (await button('valve-close'))!.click();
        const question = (await part('valve'))!.querySelector('[data-testid="valve-question"]');

        expect(words(question)).toContain(
          'Close the water valve? It cuts the water of the whole house.',
        );
        expect(question?.getAttribute('aria-labelledby')).toBe(question?.querySelector('p')?.id);
        expect(commanded).toEqual([]);

        (await button('valve-cancel'))!.click();

        expect(await button('valve-close')).toBeTruthy();
        expect(commanded).toEqual([]);
      });

      // taken is not done: the valve is read again a moment later, and its read says the rest
      it('closes the valve once confirmed and reads it again after a moment', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout'] });
        const refresh = vi.spyOn(valve, 'refresh');
        answer(valve, { state: 'open', measuredAt: house(8) });

        (await button('valve-close'))!.click();
        (await button('valve-confirm'))!.click();
        await fixture.whenStable();

        expect(commanded).toEqual(['close']);
        expect((await part('valve'))!.querySelector('mat-progress-bar')).toBeTruthy();
        expect(refresh).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(VALVE_READ_AFTER_MS);

        expect(refresh).toHaveBeenCalled();
        expect((await part('valve'))!.querySelector('mat-progress-bar')).toBeNull();
        vi.useRealTimers();
      });

      // closed by other means while the question was open: there is nothing left to ask
      it('drops the question once the valve is in the state asked for', async () => {
        answer(valve, { state: 'open', measuredAt: house(8) });
        (await button('valve-close'))!.click();
        expect((await part('valve'))!.querySelector('[data-testid="valve-question"]')).toBeTruthy();

        answer(valve, { state: 'closed', measuredAt: house(8) });

        expect((await part('valve'))!.querySelector('[data-testid="valve-question"]')).toBeNull();
        expect(await button('valve-open')).toBeTruthy();
        expect(commanded).toEqual([]);
      });

      it('says the valve has not confirmed the last command while it has not', async () => {
        answer(valve, { state: 'closed', measuredAt: house(8), lastCommandConfirmed: false });

        expect(words(await button('valve-unconfirmed'))).toContain(
          'The valve has not confirmed the last command yet.',
        );

        answer(valve, { state: 'closed', measuredAt: house(8), lastCommandConfirmed: true });

        expect(await button('valve-unconfirmed')).toBeNull();
      });

      it('tells a command the valve did not take, after reading it again', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout'] });
        commandAnswer = throwError(
          () => new ApiError('server', 502, [{ message: 'refused', code: 'DEVICE_FAILED' }]),
        );
        answer(valve, { state: 'open', measuredAt: house(8) });

        (await button('valve-close'))!.click();
        (await button('valve-confirm'))!.click();
        await vi.advanceTimersByTimeAsync(VALVE_READ_AFTER_MS);

        const text = words(await part('valve'));
        expect(text).toContain('The valve did not take the command.');
        expect(text).toContain('The valve refused the command or did not answer it.');
        vi.useRealTimers();
      });
    });

    // against a water-service without the valve the card shows its 404, and the rest of the page works
    it('words the refusals of the service and shows the rest of the page', async () => {
      fail(
        valve,
        new ApiError('client', 404, [
          { message: 'No water valve is registered', code: 'NOT_FOUND_VALVE' },
        ]),
      );
      answer(demand, { active: false });

      expect(words(await part('valve'))).toContain('No water valve is registered.');
      expect((await part('demand'))?.querySelector('mat-progress-bar')).toBeNull();
    });
  });

  // HAS-406: the pump of the circulation - its state, a start without a question (owner, 2026-11-06)
  describe('the circulation pump', () => {
    const house = (secondsAgo: number) => houseTime(new Date(), secondsAgo).slice(0, 19);

    async function el(name: string): Promise<HTMLElement | null> {
      await fixture.whenStable();
      return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${name}"]`);
    }

    const startButton = async () => (await el('pump-start')) as HTMLButtonElement;
    // disabledInteractive keeps the button focusable: Material marks it with aria-disabled
    const disabled = (button: HTMLButtonElement) =>
      button.disabled || button.getAttribute('aria-disabled') === 'true';

    it('shows a running pump, since when, what started it and the return', async () => {
      answer(pump, {
        running: true,
        since: house(65),
        trigger: 'manual',
        source: 'dashboard',
        returnTemperature: 31.06,
        tankTemperature: 41.94,
        measuredAt: house(4),
        lastRun: { startedAt: house(65), trigger: 'manual', source: 'dashboard' },
      });

      expect(words(await el('pump-state'))).toBe('cycle Running');
      expect(words(await el('pump-since'))).toMatch(/^Started 1 min\.? ago$/);
      expect(words(await el('pump-trigger'))).toBe('Started by: By hand (dashboard)');
      expect(words(await el('pump-return'))).toBe('Return 31.1 °C');
      expect(words(await el('pump-read'))).toMatch(/^Read /);
      // the run going on is the state - not a "last run"
      expect(await el('pump-last-run')).toBeNull();
      expect(disabled(await startButton())).toBe(true);
    });

    // the scene of the Shelly cloud switches the pump too, until the automation (HAS-405)
    it('says a pump on without a trigger was not started by the water service', async () => {
      answer(pump, { running: true, since: house(30), measuredAt: house(4) });

      expect(words(await el('pump-trigger'))).toBe('Started by: not by the water service');
    });

    it('shows a stopped pump with its last run and offers a start', async () => {
      answer(pump, {
        running: false,
        returnTemperature: 33.69,
        measuredAt: house(4),
        lastRun: {
          startedAt: house(10 * 60 + 5),
          endedAt: house(7 * 60),
          trigger: 'manual',
          stoppedBy: 'limit',
        },
      });

      expect(words(await el('pump-state'))).toBe('pause_circle Stopped');
      expect(await el('pump-since')).toBeNull();
      expect(words(await el('pump-last-run'))).toMatch(/^Last run 10 min\.? ago Time limit$/);
      expect(disabled(await startButton())).toBe(false);
    });

    // the service leaves the whole read out once it is older than a minute: not known, never stopped
    it('says not known for a read the service left out', async () => {
      answer(pump, {});

      expect(words(await el('pump-state'))).toBe('help State not known');
      expect(words(await el('pump-return'))).toBe('Return not known');
      expect(words(await el('pump-nothing'))).toContain(
        'The pump has not been read for over a minute.',
      );
      expect(disabled(await startButton())).toBe(false);
    });

    it('starts the pump at once and reads it and the runs again after a moment', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout'] });
      const readPump = vi.spyOn(pump, 'refresh');
      const readRuns = vi.spyOn(runs, 'refresh');
      answer(pump, { running: false, measuredAt: house(4) });

      (await startButton()).click();
      await fixture.whenStable();

      expect(started).toBe(1);
      expect((await el('circulation-card'))!.querySelector('mat-progress-bar')).toBeTruthy();
      expect(disabled(await startButton())).toBe(true);
      expect(readPump).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(CIRCULATION_READ_AFTER_MS);

      expect(readPump).toHaveBeenCalled();
      expect(readRuns).toHaveBeenCalled();
      expect((await el('circulation-card'))!.querySelector('mat-progress-bar')).toBeNull();
      vi.useRealTimers();
    });

    it.each([
      [
        'a cold tank',
        new ApiError('client', 409, [{ message: 'Tank too cold', code: 'TANK_COLD' }]),
        'The pump did not start. The water in the tank is too cold to run the circulation.',
      ],
      [
        // DEVICE_FAILED is shared with the valve: here it is the pump that failed
        'the Uni refusing it',
        new ApiError('server', 502, [{ message: 'Device failed', code: 'DEVICE_FAILED' }]),
        'The pump did not start. The pump refused the start or did not answer it.',
      ],
      [
        // a start without an answer may have been carried out
        'no answer',
        new ApiError('network', 0),
        'The start got no answer and may have been carried out.',
      ],
    ])('words a start that failed for %s, after reading the pump again', async (_, error, text) => {
      vi.useFakeTimers({ toFake: ['setTimeout'] });
      startAnswer = throwError(() => error);
      answer(pump, { running: false, measuredAt: house(4) });

      (await startButton()).click();
      await vi.advanceTimersByTimeAsync(CIRCULATION_READ_AFTER_MS);

      expect(words((await el('circulation-card'))!.querySelector('[role="alert"]'))).toContain(
        text,
      );
      vi.useRealTimers();
    });

    // the start had no answer but was carried out: the notice goes once the pump is read running
    it('drops the notice of a start without an answer once the pump runs', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout'] });
      startAnswer = throwError(() => new ApiError('network', 0));
      answer(pump, { running: false, measuredAt: house(4) });

      (await startButton()).click();
      await vi.advanceTimersByTimeAsync(CIRCULATION_READ_AFTER_MS);
      expect((await el('circulation-card'))!.querySelector('[role="alert"]')).toBeTruthy();

      answer(pump, { running: true, since: house(8), trigger: 'manual', measuredAt: house(2) });

      expect((await el('circulation-card'))!.querySelector('[role="alert"]')).toBeNull();
      vi.useRealTimers();
    });

    it('gives the runs of today to a card of their own, after the history', async () => {
      await fixture.whenStable();
      const card = (fixture.nativeElement as HTMLElement).querySelector('app-circulation-runs');

      expect(card).toBeTruthy();
      expect(card!.previousElementSibling?.tagName.toLowerCase()).toBe('app-water-history');
    });
  });
});
