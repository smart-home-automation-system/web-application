import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { fakeQueryResource } from '../../../testing/fake-resource';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { houseTime } from '../../../mocks/house-time';
import { ApiError } from '../../core/api/api-error';
import { PollingResource } from '../../core/api/polling-resource';
import {
  ConsumptionTotals,
  WaterApi,
  WaterHeatingDemand,
  WaterTemperatures,
  WaterValve,
} from '../../data-access/water/water-api';
import { Observable, of, throwError } from 'rxjs';

import { HotWater, VALVE_READ_AFTER_MS } from './hot-water';

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
  let commanded: string[];
  let commandAnswer: Observable<void>;
  let fixture: ComponentFixture<HotWater>;

  beforeEach(() => {
    temperatures = fakeResource();
    demand = fakeResource();
    valve = fakeResource();
    totals = fakeResource();
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
    name:
      'temperatures' | 'demand' | 'circulation-card' | 'tank' | 'circulation' | 'valve' | 'usage',
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

  // the owner's layout (2026-10-10): the tank alone in its card, the circulation under the demand
  it('shows the temperature of the circulation in a card of its own, after that of the demand', async () => {
    answer(temperatures, { water: { temperature: 44.75 }, circulation: { temperature: 29.81 } });

    const circulation = await part('circulation');
    const card = (await part('circulation-card'))!;

    expect(words(circulation)).toBe('29.8 °C');
    expect(words(card.querySelector('mat-card-title'))).toBe('Circulation');
    expect(card.contains(circulation)).toBe(true);
    expect(words(await part('temperatures'))).not.toContain('29.8');
    expect((await part('demand'))!.nextElementSibling).toBe(card);
  });

  // the field exists in the answer and is always false: the backend does not fill it in
  it('says nothing about the circulation pump', async () => {
    answer(temperatures, {
      water: { temperature: 44.75 },
      circulation: { temperature: 29.81, pumpActive: false },
    });
    await fixture.whenStable();

    expect(words(fixture.nativeElement as HTMLElement).toLowerCase()).not.toContain('pump');
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
    ])('says in both cards that nothing was measured yet, for %s', async (_, body) => {
      answer(temperatures, body as WaterTemperatures | null);

      const shown = (await part('temperatures'))!;
      const loop = (await part('circulation-card'))!;

      expect(words(shown)).toContain(NOTHING_MEASURED);
      expect(words(loop)).toContain(NOTHING_MEASURED);
      expect(await part('tank')).toBeNull();
      expect(await part('circulation')).toBeNull();
      expect(shown.querySelector('[role="meter"]')).toBeNull();
      expect(shown.querySelector('[role="alert"]')).toBeNull();
      expect(loop.querySelector('[role="alert"]')).toBeNull();
    });

    it('shows the one temperature that is there, and says in the card of the other that it is missing', async () => {
      answer(temperatures, { water: { temperature: 41 } });

      expect(words(await part('tank'))).toBe('41.0 °C');
      expect(await part('circulation')).toBeNull();
      expect(words(await part('temperatures'))).not.toContain(NOTHING_MEASURED);
      expect(words(await part('circulation-card'))).toContain(NOTHING_MEASURED);
    });

    it('shows the circulation alone when only it was measured', async () => {
      answer(temperatures, { circulation: { temperature: 29.81 } });

      expect(await part('tank')).toBeNull();
      expect(words(await part('circulation'))).toBe('29.8 °C');
      expect(words(await part('circulation-card'))).not.toContain(NOTHING_MEASURED);
      expect((await part('temperatures'))!.querySelector('[role="meter"]')).toBeNull();
      expect(words(await part('temperatures'))).toContain(NOTHING_MEASURED);
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
    it('says in both cards why the temperatures are missing, and leaves the demand alone', async () => {
      fail(temperatures, new ApiError('server', 502));
      answer(demand, { active: false });
      await fixture.whenStable();

      const alerts = [...(fixture.nativeElement as HTMLElement).querySelectorAll('[role="alert"]')];

      expect(alerts).toHaveLength(2);
      for (const name of ['temperatures', 'circulation-card'] as const) {
        const card = (await part(name))!;

        expect(words(card.querySelector('[role="alert"]')), name).toContain(
          'The service is not available right now (error 502).',
        );
        // no reading and a failure: the failure is the explanation, not "nothing measured yet"
        expect(words(card), name).not.toContain(NOTHING_MEASURED);
      }
      expect((await part('demand'))!.querySelector('[role="alert"]')).toBeNull();
    });

    it('keeps the last readings on screen next to the failure, marked as out of date', async () => {
      answer(temperatures, { water: { temperature: 44.75 }, circulation: { temperature: 29.81 } });
      fail(temperatures, new ApiError('network', 0));

      const shown = (await part('temperatures'))!;

      expect(words(await part('tank'))).toBe('44.8 °C');
      expect(words(await part('circulation'))).toContain('29.8 °C');
      expect(words(shown.querySelector('[role="alert"]'))).toContain(
        'The server cannot be reached.',
      );
      expect(shown.querySelector('app-data-freshness')?.classList).toContain('freshness--stale');
      expect(
        (await part('circulation-card'))!.querySelector('app-data-freshness')?.classList,
      ).toContain('freshness--stale');
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

    // one time for both sensors: the card of the circulation dates its reading the same way
    it('says the same in the card of the circulation', async () => {
      answer(temperatures, {
        measuredAt: measured(7 * 60 + 5),
        water: { temperature: 46.81 },
        circulation: { temperature: 29.81 },
      });

      const line = (await part('circulation-card'))?.querySelector('[data-testid="measured"]');

      expect(words(line)).toMatch(/Measured 7 min\.? ago - the sensor has not been read since\./);
      expect(line?.classList).toContain('tile__measured--old');
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
    expect(words(await part('circulation'))).toBe('29,8 °C');
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
});
