import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { Observable, of, throwError } from 'rxjs';

import { RecordedCharts, provideChartTesting } from '../../../testing/chart';
import {
  FakeQueryResource,
  FakeResource,
  answer,
  answerQuery,
  fakeQueryResource,
  fakeResource,
} from '../../../testing/fake-resource';
import { provideI18nTesting } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { HistoryRange } from '../../core/time/history-range';
import {
  AirconApi,
  AirconPlug,
  AirconPowerBucket,
  AirconRule,
  AirconRuleBody,
  AirconRun,
  AirconUnit,
  PowerCycleState,
} from '../../data-access/aircon/aircon-api';
import { Aircon } from './aircon';

const unit = (id: number, room: string, more: Partial<AirconUnit> = {}): AirconUnit => ({
  id,
  name: 'Air conditioner',
  room,
  power: false,
  mode: 'cool',
  targetTemperature: 24,
  fanSpeed: 'auto',
  quiet: false,
  turbo: false,
  sleep: false,
  reachable: true,
  ...more,
});

// the order of the answer is not the order of the house
const UNITS: readonly AirconUnit[] = [
  unit(144, 'sanctum', { filter: { hoursSince: 3.6, cleanedAt: '2026-11-08T12:00:00' } }),
  unit(140, 'office', { filter: { hoursSince: 212.6, due: true } }),
  unit(142, 'bedroom'),
];

const RULES: readonly AirconRule[] = [
  {
    unitId: 144,
    keepBelow: { enabled: true, threshold: 25, hysteresis: 1, target: 22 },
    heatBySchedule: { enabled: true },
  },
];

const PLUGS: readonly AirconPlug[] = [
  { plug: 'sanctum', power: 412, compressorRunning: true, todayKwh: 1.4, last7DaysKwh: 6.8 },
  {
    plug: 'indoor',
    relay: true,
    power: 18.3,
    compressorRunning: false,
    todayKwh: 3.2,
    last7DaysKwh: 21.5,
    last30DaysKwh: 80.1,
  },
];

describe('Aircon', () => {
  let fixture: ComponentFixture<Aircon>;
  let units: FakeResource<readonly AirconUnit[] | null>;
  let rules: FakeResource<readonly AirconRule[] | null>;
  let power: FakeResource<readonly AirconPlug[] | null>;
  let cycle: FakeResource<PowerCycleState | null>;
  let samples: (() => string)[];
  let runs: FakeQueryResource<HistoryRange, readonly AirconRun[] | null>;
  let runsRange: () => HistoryRange;
  let runsOf: () => number;
  let unitsEvery: number | undefined;
  let saved: { id: number; body: AirconRuleBody }[];
  let removed: number[];
  let cleaned: number[];
  let cycles: (string | undefined)[];
  let refusal: ApiError | undefined;

  const reply = (): Observable<void> =>
    refusal === undefined ? of(undefined) : throwError(() => refusal);

  beforeEach(() => {
    units = fakeResource();
    rules = fakeResource();
    power = fakeResource();
    cycle = fakeResource();
    runs = fakeQueryResource();
    samples = [];
    for (const resource of [units, rules, power, cycle]) {
      resource.refresh = vi.fn(() => Promise.resolve());
    }
    saved = [];
    removed = [];
    cleaned = [];
    cycles = [];
    refusal = undefined;
    localStorage.setItem(
      'smart-home.profile',
      JSON.stringify({ name: 'Aurelia', role: 'admin', rooms: ['office'] }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        provideChartTesting(new RecordedCharts()),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        {
          provide: AirconApi,
          useValue: {
            watchUnits: (every: number) => {
              unitsEvery = every;
              return units;
            },
            watchRules: () => rules,
            watchPower: () => power,
            watchPowerCycle: () => cycle,
            // the plug is an input: read when a call is made, never while the card is being made
            watchPowerSamples: (plug: () => string) => {
              samples.push(plug);
              return fakeQueryResource<HistoryRange, readonly AirconPowerBucket[] | null>();
            },
            watchRuns: (id: () => number, range: () => HistoryRange) => {
              runsOf = id;
              runsRange = range;
              return runs;
            },
            command: () => reply(),
            saveRule: (id: number, body: AirconRuleBody) => {
              saved.push({ id, body });
              return reply();
            },
            deleteRule: (id: number) => {
              removed.push(id);
              return reply();
            },
            filterCleaned: (id: number) => {
              cleaned.push(id);
              return reply();
            },
            startPowerCycle: (member: string | undefined) => {
              cycles.push(member);
              return reply();
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(Aircon);
  });

  afterEach(() => {
    localStorage.clear();
  });

  const page = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const words = (element: Element | null | undefined): string =>
    element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const unitCard = (id: number): HTMLElement =>
    page().querySelector<HTMLElement>(`[data-unit="${id}"]`)!;
  const inCard = (id: number, testId: string): HTMLElement | null =>
    unitCard(id).querySelector<HTMLElement>(`[data-testid="${testId}"]`);

  async function answered(): Promise<void> {
    answer(units, UNITS);
    answer(rules, RULES);
    answer(power, PLUGS);
    answer(cycle, { allowed: false, reason: 'Air conditioner 140 is on' });
    await fixture.whenStable();
  }

  function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('reads the units as often as the card of My room, the commands being here', async () => {
    await fixture.whenStable();
    expect(unitsEvery).toBe(10_000);
  });

  it('lists the units in the order of the rooms of the house', async () => {
    await answered();
    const rooms = [...page().querySelectorAll('[data-unit]')].map((card) =>
      card.getAttribute('data-unit'),
    );
    expect(rooms).toEqual(['140', '142', '144']);
  });

  it('tells the four calls once, at the top', async () => {
    await answered();
    const sources = [...page().querySelectorAll('[data-source]')].map((source) =>
      source.getAttribute('data-source'),
    );
    expect(sources).toEqual(['units', 'rules', 'power', 'cycle']);
  });

  it('says the hours of a filter, since when, and when it is time to clean it', async () => {
    await answered();
    expect(words(inCard(140, 'filter'))).toContain('212.6 h of work since its history began');
    expect(words(inCard(140, 'filter'))).toContain('time to clean the filter');
    expect(words(inCard(144, 'filter'))).toContain('3.6 h of work since the cleaning of 8 Nov');
  });

  it('marks a filter cleaned only after a question, then reads the units again', async () => {
    await answered();
    inCard(144, 'filter-cleaned')!.click();
    await fixture.whenStable();
    expect(cleaned).toEqual([]);
    const question = inCard(144, 'filter-question')!;
    expect(words(question)).toContain('Its hours start again at 0');

    question.querySelectorAll('button')[1].click();
    await fixture.whenStable();
    expect(cleaned).toEqual([144]);
    expect(units.refresh).toHaveBeenCalled();
  });

  it('tells the rule in a few words, "No rule" for a unit without one and "not known" before the rules', async () => {
    answer(units, UNITS);
    await fixture.whenStable();
    expect(words(inCard(144, 'rule'))).toContain('The rule is not known.');
    expect(inCard(144, 'rule-edit')).toBeNull();

    answer(rules, RULES);
    await fixture.whenStable();
    expect(words(inCard(144, 'rule'))).toContain(
      'Keeps the room below 25 °C, cooling at 22 °C · frost protection on',
    );
    expect(words(inCard(140, 'rule'))).toContain('No rule.');
    expect(words(inCard(140, 'rule-edit'))).toBe('Write a rule');
  });

  it('never reads a part of the rule the answer leaves out as off', async () => {
    answer(units, UNITS);
    answer(rules, [{ unitId: 140 }]);
    await fixture.whenStable();
    expect(words(inCard(140, 'rule'))).toContain(
      'Keeping the room cool not known · frost protection not known',
    );
  });

  it('refuses a rule the service would refuse, without sending it', async () => {
    await answered();
    inCard(144, 'rule-edit')!.click();
    await fixture.whenStable();
    type(inCard(144, 'rule-threshold') as HTMLInputElement, '23');
    type(inCard(144, 'rule-target') as HTMLInputElement, '24');
    inCard(144, 'rule-save')!.click();
    await fixture.whenStable();

    expect(words(inCard(144, 'rule-problem'))).toBe('The target must not be above the threshold.');
    expect(saved).toEqual([]);
  });

  it('sends the rule whole, with a comma read as a point, and reads the rules again', async () => {
    await answered();
    inCard(144, 'rule-edit')!.click();
    await fixture.whenStable();
    type(inCard(144, 'rule-threshold') as HTMLInputElement, '26,5');
    inCard(144, 'rule-save')!.click();
    await fixture.whenStable();

    expect(saved).toEqual([
      {
        id: 144,
        body: {
          keepBelow: { enabled: true, threshold: 26.5, hysteresis: 1, target: 22 },
          heatBySchedule: { enabled: true },
        },
      },
    ]);
    expect(rules.refresh).toHaveBeenCalled();
    expect(inCard(144, 'rule-form')).toBeNull();
  });

  it('removes a rule only after a question', async () => {
    await answered();
    inCard(144, 'rule-edit')!.click();
    await fixture.whenStable();
    inCard(144, 'rule-remove')!.click();
    await fixture.whenStable();
    expect(removed).toEqual([]);

    inCard(144, 'rule-question')!.querySelectorAll('button')[1].click();
    await fixture.whenStable();
    expect(removed).toEqual([144]);
    expect(rules.refresh).toHaveBeenCalled();
  });

  it('counts a rule already gone as removed', async () => {
    await answered();
    refusal = new ApiError('client', 404, [{ message: 'No rule', code: 'NOT_FOUND_RULE' }]);
    inCard(144, 'rule-edit')!.click();
    await fixture.whenStable();
    inCard(144, 'rule-remove')!.click();
    await fixture.whenStable();
    inCard(144, 'rule-question')!.querySelectorAll('button')[1].click();
    await fixture.whenStable();

    expect(removed).toEqual([144]);
    expect(inCard(144, 'rule-failure')).toBeNull();
    expect(inCard(144, 'rule-question')).toBeNull();
  });

  it('keeps the form and tells a refusal of the service', async () => {
    await answered();
    refusal = new ApiError('client', 400, [{ message: 'Bad rule', code: 'INVALID_RULE' }]);
    inCard(144, 'rule-edit')!.click();
    await fixture.whenStable();
    inCard(144, 'rule-save')!.click();
    await fixture.whenStable();

    expect(words(inCard(144, 'rule-failure'))).toBe(
      'The air conditioning service refused the rule.',
    );
    expect(inCard(144, 'rule-form')).not.toBeNull();
  });

  it('asks for the changes of a unit only once they are opened', async () => {
    await answered();
    expect(inCard(140, 'runs')).toBeNull();
    inCard(140, 'runs-toggle')!.click();
    await fixture.whenStable();
    expect(inCard(140, 'runs')).toBeNull();

    expect(runsOf()).toBe(140);
    answerQuery(runs, { from: '2000-01-01T00:00:00', to: '2000-01-02T00:00:00' }, []);
    await fixture.whenStable();
    // the answer of another range is never shown under these 24 hours
    expect(inCard(140, 'runs-none')).toBeNull();

    answerQuery(runs, runsRange(), [
      {
        at: '2026-11-08T07:02:00',
        power: true,
        mode: 'cool',
        targetTemperature: 23,
        source: 'remote',
      },
      { at: '2026-11-08T09:15:00', power: false, source: 'window' },
    ]);
    await fixture.whenStable();
    const rows = [...inCard(140, 'runs')!.querySelectorAll('li')].map(words);
    // the newest first, with who made it
    expect(rows).toEqual(['09:15 Off window', '07:02 On · Cooling · 23 °C remote']);
  });

  it('shows what each plug draws, the indoor one first, and a figure it leaves out as not known', async () => {
    await answered();
    const plugs = [...page().querySelectorAll('[data-plug]')];
    expect(plugs.map((plug) => plug.getAttribute('data-plug'))).toEqual(['indoor', 'sanctum']);
    expect(words(plugs[0])).toContain('18 W');
    expect(words(plugs[0])).toContain('idle');
    expect(words(plugs[0])).toContain('80.1 kWh');
    expect(words(plugs[1])).toContain('running');
    expect(words(plugs[1])).toContain('30 days –');
  });

  it('offers no power cycle the service does not allow, and prints its reason as it came', async () => {
    await answered();
    const section = page().querySelector('[data-testid="power-cycle"]')!;
    expect(section.querySelector('[data-testid="cycle-start"]')).toBeNull();
    expect(words(section.querySelector('[data-testid="cycle-refused"]'))).toBe(
      'Not possible now: Air conditioner 140 is on',
    );
  });

  it('power cycles the indoor plug after a question, with the member, and reads everything it changes', async () => {
    await answered();
    answer(cycle, {
      allowed: true,
      lastRun: { startedAt: '2026-11-08T12:38:00', result: 'done', requestedBy: 'Aurelia' },
    });
    await fixture.whenStable();
    const section = page().querySelector<HTMLElement>('[data-testid="power-cycle"]')!;
    expect(words(section.querySelector('[data-testid="cycle-last"]'))).toBe(
      'Last: 8 Nov, 12:38 · done · Aurelia',
    );

    section.querySelector<HTMLButtonElement>('[data-testid="cycle-start"]')!.click();
    await fixture.whenStable();
    expect(cycles).toEqual([]);
    section.querySelector<HTMLButtonElement>('[data-testid="cycle-confirm"]')!.click();
    await fixture.whenStable();

    expect(cycles).toEqual(['Aurelia']);
    expect(cycle.refresh).toHaveBeenCalled();
    expect(power.refresh).toHaveBeenCalled();
    expect(units.refresh).toHaveBeenCalled();
  });

  it('takes its question away for good once the service no longer allows the cycle', async () => {
    await answered();
    answer(cycle, { allowed: true });
    await fixture.whenStable();
    page().querySelector<HTMLButtonElement>('[data-testid="cycle-start"]')!.click();
    await fixture.whenStable();
    expect(page().querySelector('[data-testid="cycle-question"]')).not.toBeNull();

    answer(cycle, { allowed: false, reason: 'Air conditioner 141 is on' });
    await fixture.whenStable();
    answer(cycle, { allowed: true });
    await fixture.whenStable();
    expect(page().querySelector('[data-testid="cycle-question"]')).toBeNull();
  });

  it('draws the draw of each plug from a call of its own', async () => {
    await answered();
    expect(samples.map((plug) => plug())).toEqual(['indoor', 'sanctum']);
    expect(page().querySelector('[data-testid="power-chart-indoor"]')).not.toBeNull();
  });
});
