import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { PollingResource } from '../../core/api/polling-resource';
import { WaterApi, WaterHeatingDemand, WaterTemperatures } from '../../data-access/water/water-api';
import { HotWater } from './hot-water';

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
  let fixture: ComponentFixture<HotWater>;

  beforeEach(() => {
    temperatures = fakeResource();
    demand = fakeResource();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        {
          provide: WaterApi,
          useValue: { watchTemperatures: () => temperatures, watchHeatingDemand: () => demand },
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

  /** A card of the page, or one of the two readings inside the card of the temperatures. */
  async function part(
    name: 'temperatures' | 'demand' | 'tank' | 'circulation',
  ): Promise<HTMLElement | null> {
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${name}"]`);
  }

  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('shows a progress bar in each card until its call has answered', async () => {
    for (const name of ['temperatures', 'demand'] as const) {
      expect((await part(name))?.querySelector('mat-progress-bar'), name).toBeTruthy();
    }

    answer(demand, { active: false });

    expect((await part('demand'))?.querySelector('mat-progress-bar')).toBeNull();
    expect((await part('temperatures'))?.querySelector('mat-progress-bar')).toBeTruthy();
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
        '38 °C',
        '42 °C',
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

  it('shows the temperature of the circulation under that of the tank, in the same card', async () => {
    answer(temperatures, { water: { temperature: 44.75 }, circulation: { temperature: 29.81 } });

    const circulation = await part('circulation');

    expect(words(circulation)).toBe('cycleCirculation 29.8 °C');
    expect((await part('temperatures'))!.contains(circulation)).toBe(true);
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
    ])('says once that nothing was measured yet, for %s', async (_, body) => {
      answer(temperatures, body as WaterTemperatures | null);

      const shown = (await part('temperatures'))!;

      expect(words(shown)).toContain(NOTHING_MEASURED);
      expect(await part('tank')).toBeNull();
      expect(await part('circulation')).toBeNull();
      expect(shown.querySelector('[role="meter"]')).toBeNull();
      expect(shown.querySelector('[role="alert"]')).toBeNull();
    });

    it('shows the one temperature that is there, without a word about the other', async () => {
      answer(temperatures, { water: { temperature: 41 } });

      expect(words(await part('tank'))).toBe('41.0 °C');
      expect(await part('circulation')).toBeNull();
      expect(words(await part('temperatures'))).not.toContain(NOTHING_MEASURED);
    });

    it('shows the circulation alone when only it was measured', async () => {
      answer(temperatures, { circulation: { temperature: 29.81 } });

      expect(await part('tank')).toBeNull();
      expect(words(await part('circulation'))).toContain('29.8 °C');
      expect((await part('temperatures'))!.querySelector('[role="meter"]')).toBeNull();
    });
  });

  describe('whether the water asks to be heated', () => {
    it('says that heating is needed', async () => {
      answer(demand, { active: true });

      const state = (await part('demand'))!.querySelector('.tile__state')!;

      expect(words(state)).toBe('mode_heat Heating needed');
      expect(state.classList).toContain('tile__state--on');
    });

    it('says that the water is warm enough', async () => {
      answer(demand, { active: false });

      const state = (await part('demand'))!.querySelector('.tile__state')!;

      expect(words(state)).toBe('check_circle Warm enough');
      expect(state.classList).not.toContain('tile__state--on');
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
    // two readings, one call: one explanation
    it('says why the temperatures are missing once, and leaves the demand alone', async () => {
      fail(temperatures, new ApiError('server', 502));
      answer(demand, { active: false });
      await fixture.whenStable();

      const alerts = [...(fixture.nativeElement as HTMLElement).querySelectorAll('[role="alert"]')];

      expect(alerts).toHaveLength(1);
      expect(words(alerts[0])).toContain('The service is not available right now (error 502).');
      expect((await part('temperatures'))!.contains(alerts[0])).toBe(true);
      // no reading and a failure: the failure is the explanation, not "nothing measured yet"
      expect(words(await part('temperatures'))).not.toContain(NOTHING_MEASURED);
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
    });

    it('says why the demand is not known', async () => {
      fail(demand, new ApiError('server', 503));

      const shown = (await part('demand'))!;

      expect(words(shown.querySelector('[role="alert"]'))).toContain('(error 503)');
      expect(words(shown)).not.toContain('does not say');
    });
  });

  it('speaks Polish, with a decimal comma', async () => {
    answer(temperatures, { water: { temperature: 44.75 }, circulation: { temperature: 29.81 } });
    answer(demand, { active: true });
    await useLanguage('pl');

    const shown = (await part('temperatures'))!;

    expect(words((fixture.nativeElement as HTMLElement).querySelector('h1'))).toBe('Ciepła woda');
    expect(words(await part('tank'))).toBe('44,8 °C');
    expect(words(await part('circulation'))).toBe('cycleCyrkulacja 29,8 °C');
    expect(shown.querySelector('[role="meter"]')?.getAttribute('aria-valuetext')).toBe(
      '44,8 °C; utrzymywana między 38 a 42 °C',
    );
    expect(words((await part('demand'))!.querySelector('.tile__state'))).toContain(
      'Wymaga grzania',
    );
  });
});
