import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecordedCharts, provideChartTesting } from '../../../testing/chart';
import {
  FakeQueryResource,
  FakeResource,
  answer,
  answerQuery,
  fail,
  fakeQueryResource,
  fakeResource,
} from '../../../testing/fake-resource';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { HistoryRange } from '../../core/time/history-range';
import {
  Battery,
  DaysQuery,
  EnergyAlert,
  EnergyApi,
  EnergyDay,
  EnergyFlows,
  EnergyHistory,
  EnergyMonths,
  EnergyStatus,
  GridOutage,
  GridReading,
  Inverter,
} from '../../data-access/energy/energy-api';
import { Energy } from './energy';

// 14:45 in the house (winter time, UTC+1)
const NOW = new Date('2026-11-02T13:45:00Z');

const FLOWS: EnergyFlows = {
  production: 5320,
  solaxPv: 3410,
  sofarPv: 1910,
  gridPower: -1480,
  batteryPower: 2150,
  houseLoad: 1690,
  today: { production: 18.42, imported: 3.1, selfConsumption: 0.628 },
};

const INVERTERS: Inverter[] = [
  {
    id: 'solax',
    name: 'SOLAX inverter',
    runMode: 'eps',
    pvPower: 3410,
    pv: { pv1: { voltage: 402.5, power: 2133 } },
    temperature: 52,
    measuredAt: '2026-11-02T14:44:50',
    stale: false,
    source: 'local',
  },
  {
    id: 'sofar',
    name: 'SOFAR inverter',
    state: 'Grid connected',
    faults: ['GridOVP'],
    stale: false,
  },
];

describe('Energy', () => {
  let status: FakeResource<EnergyStatus | null>;
  let flows: FakeResource<EnergyFlows | null>;
  let grid: FakeResource<GridReading | null>;
  let inverters: FakeResource<readonly Inverter[] | null>;
  let battery: FakeResource<Battery | null>;
  let alerts: FakeResource<readonly EnergyAlert[] | null>;
  let outages: FakeQueryResource<HistoryRange, readonly GridOutage[] | null>;
  let days: FakeQueryResource<DaysQuery, readonly EnergyDay[] | null>;
  let months: FakeQueryResource<number, EnergyMonths | null>;
  let daysAsked: (() => DaysQuery) | undefined;
  let yearAsked: () => number;
  let outagesAsked: () => HistoryRange;
  let fixture: ComponentFixture<Energy>;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    status = fakeResource();
    flows = fakeResource();
    grid = fakeResource();
    inverters = fakeResource();
    battery = fakeResource();
    alerts = fakeResource();
    outages = fakeQueryResource();
    days = fakeQueryResource();
    daysAsked = undefined;
    months = fakeQueryResource();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        provideChartTesting(new RecordedCharts()),
        {
          provide: EnergyApi,
          useValue: {
            watchStatus: () => status,
            watchFlows: () => flows,
            watchGrid: () => grid,
            watchInverters: () => inverters,
            watchBattery: () => battery,
            watchAlerts: () => alerts,
            // the forecast card (HAS-373) has a test of its own
            watchForecast: () => fakeResource(),
            watchOutages: (range: () => HistoryRange) => {
              outagesAsked = range;
              return outages;
            },
            watchHistory: () => fakeQueryResource<HistoryRange, EnergyHistory | null>(),
            // the days card asks first; the meter of Tauron (HAS-417) asks the same and has a test of its own
            watchDays: (query: () => DaysQuery) => {
              if (daysAsked !== undefined) {
                return fakeQueryResource();
              }
              daysAsked = query;
              return days;
            },
            watchMonths: (year: () => number) => {
              yearAsked = year;
              return months;
            },
            // the control of the charge (HAS-342) has a test of its own
            watchCharge: () => fakeResource(),
            watchChargeRuns: () => fakeQueryResource(),
            watchAutomation: () => fakeResource(),
            watchPlannedOutages: () => fakeResource(),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(Energy);
  });

  afterEach(() => vi.useRealTimers());

  const page = () => fixture.nativeElement as HTMLElement;
  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function card(name: string): Promise<HTMLElement> {
    await fixture.whenStable();
    return page().querySelector(`[data-testid="card-${name}"]`) as HTMLElement;
  }

  it('draws where the energy goes now, the arrows said in words', async () => {
    answer(flows, FLOWS);

    const flow = await card('flow');
    expect(words(flow.querySelector('[data-node="panels"]'))).toContain('5.32 kW');
    expect(words(flow.querySelector('[data-node="house"]'))).toContain('1.69 kW');
    expect(flow.querySelector('.arrow--grid')?.getAttribute('aria-label')).toBe(
      'The house returns energy to the grid',
    );
    expect(flow.querySelector('.arrow--battery')?.getAttribute('aria-label')).toBe(
      'The house charges the battery',
    );
    expect(words(flow.querySelector('[data-today="production"]'))).toBe('Produced 18.42 kWh');
    expect(words(flow.querySelector('[data-today="selfConsumption"]'))).toContain('63 %');
  });

  // the battery of the diagram says how full it is - the SOC of the battery call (owner, 2026-11-11)
  it('shows the charge of the battery in the diagram, from the battery call', async () => {
    answer(flows, FLOWS);
    let flow = await card('flow');
    expect(words(flow.querySelector('[data-testid="flow-soc"]'))).toBe('Charge not known');

    answer(battery, { soc: 68.4, power: 2150, direction: 'charging' });
    flow = await card('flow');
    expect(words(flow.querySelector('[data-testid="flow-soc"]'))).toBe('Charged 68 %');
  });

  it('tells a failure of the battery call in the flow card too, apart from the flows', async () => {
    answer(flows, FLOWS);
    fail(battery, new ApiError('server', 503));

    const flow = await card('flow');
    expect(words(flow.querySelector('[data-testid="flow-soc"]'))).toBe('Charge not known');
    expect(flow.querySelector('[data-node="house"]')).not.toBeNull();
    expect(flow.querySelector('app-api-error-strip .strip')).not.toBeNull();
  });

  // what the answer leaves out is not known, never 0 - the diagram too
  it('says "not known" for a power and a total the answer leaves out', async () => {
    answer(flows, { production: 0 });

    const flow = await card('flow');
    expect(words(flow.querySelector('[data-node="panels"]'))).toContain('0 W');
    expect(words(flow.querySelector('[data-node="grid"]'))).toContain('not known');
    expect(flow.querySelector('.arrow--grid')?.getAttribute('aria-label')).toBe('Not known');
    expect(words(flow.querySelector('[data-today="imported"]'))).toBe(
      'Taken from the grid not known',
    );
  });

  it('says the grid is lost in red, and a grid not known is never lost', async () => {
    answer(status, { sources: [{ source: 'solax', reachable: false }], grid: { state: null } });
    let sources = await card('sources');
    expect(sources.querySelector('[data-testid="grid-state"]')?.getAttribute('data-state')).toBe(
      'unknown',
    );
    expect(words(sources.querySelector('[data-source="solax"]'))).toBe('SOLAX silent');

    answer(status, { sources: [], grid: { state: 'lost', since: '2026-11-02T14:02:18' } });
    sources = await card('sources');
    expect(words(sources.querySelector('[data-testid="grid-state"]'))).toBe(
      'power_off The grid is lost - the house runs on the battery',
    );
    expect(sources.querySelector('.tile__lead--alert')).not.toBeNull();
  });

  it('shows each inverter in its card from the one call, in the words of the service', async () => {
    answer(inverters, INVERTERS);

    const solax = await card('solax');
    expect(words(solax.querySelector('[data-field="runMode"]'))).toBe(
      'Run mode ! backup supply from the battery',
    );
    expect(words(solax.querySelector('[data-string="pv1"]'))).toBe('String 1 402.5 V 2.13 kW');
    // the second string is not in the answer: no row
    expect(solax.querySelector('[data-string="pv2"]')).toBeNull();
    expect(words(solax.querySelector('[data-field="acPower"]'))).toBe('AC output not known');

    const sofar = await card('sofar');
    expect(words(sofar.querySelector('[data-field="state"]'))).toBe('State Grid connected');
    expect(words(sofar.querySelector('[data-field="faults"]'))).toBe('Faults 1 GridOVP');
  });

  it('says so when the service does not name an inverter, and tells a failure on both cards', async () => {
    answer(inverters, [INVERTERS[0]]);
    expect(words(await card('sofar'))).toContain('The service does not name this inverter.');

    fail(inverters, new ApiError('client', 404, [{ code: 'NOT_FOUND_INVERTER', message: 'x' }]));
    expect(words(await card('solax'))).toContain('The energy service does not know this inverter.');
    expect(words(await card('sofar'))).toContain('The energy service does not know this inverter.');
  });

  // 22 A of energy-service: the phase is coloured at once, the service warns after three minutes
  it('marks a phase above the warning current', async () => {
    answer(grid, {
      phases: { a: { voltage: 236.4, current: 6.2 }, b: { voltage: 233.9, current: 23.4 } },
      totalActivePower: -1480,
      direction: 'export',
      stale: false,
    });

    const meter = await card('grid');
    expect(words(meter.querySelector('[data-field="total"]'))).toBe(
      'Returning to the grid 1.48 kW',
    );
    expect(meter.querySelector('[data-phase="a"]')?.classList).not.toContain('phase--overloaded');
    expect(meter.querySelector('[data-phase="b"]')?.classList).toContain('phase--overloaded');
    expect(words(meter.querySelector('[data-phase="c"]'))).toBe('Phase C not known');
  });

  it('shows the battery with its gauge, and no gauge for a charge not known', async () => {
    answer(battery, {
      soc: 68,
      power: 2150,
      direction: 'charging',
      remainingKwh: 18.02,
      stale: false,
    });
    let card_ = await card('battery');
    expect(words(card_.querySelector('[data-field="soc"]'))).toBe('68 %');
    expect(card_.querySelector('mat-progress-bar')).not.toBeNull();
    expect(words(card_.querySelector('[data-field="power"]'))).toBe('Charging 2.15 kW');

    answer(battery, { stale: true });
    card_ = await card('battery');
    expect(words(card_.querySelector('[data-field="soc"]'))).toBe('not known');
    expect(card_.querySelector('[data-field="soc"] mat-progress-bar')).toBeNull();
    expect(words(card_.querySelector('[data-field="cycles"]'))).toBe('');
  });

  it('lists the open alarms and the outages of the year, and says when there are none', async () => {
    answer(alerts, [
      { source: 'phase b', kind: 'overload', openedAt: '2026-11-02T14:37:00' },
      { source: 'sofar', kind: 'alarm', openedAt: '2026-11-02T12:45:00', detail: 'GridOVP' },
      { source: 'windmill', kind: 'spinning', openedAt: '2026-11-02T11:00:00' },
    ]);
    await fixture.whenStable();
    const listed = [...(await card('alerts')).querySelectorAll('li')].map(words);
    expect(listed[0]).toContain('Overloaded Phase B');
    expect(listed[1]).toContain('Alarm SOFAR GridOVP');
    // a kind and a source this version does not know are printed as they came
    expect(listed[2]).toContain('spinning windmill');

    answerQuery(outages, outagesAsked(), []);
    expect(words(await card('outages'))).toContain('No outage in the last year');
    // the endpoint takes at most 366 days
    expect(outagesAsked()).toEqual({ from: '2025-11-02T00:00:00', to: '2026-11-03T00:00:00' });

    answer(alerts, []);
    expect(words(await card('alerts'))).toContain('No open alarm');
  });

  it('settles the billing year in kWh, with the credit in the grid now', async () => {
    expect(yearAsked()).toBe(2026);
    answerQuery(months, 2026, {
      year: 2026,
      ratio: 0.7,
      months: [
        { month: '2026-09', days: 30, exported: 210.8, credited: 147.56, stored: 27.16 },
        { month: '2026-10', days: 0, credited: 0, stored: 0 },
      ],
    });
    await fixture.whenStable();
    const settlement = page().querySelector('[data-testid="energy-settlement"]')!;
    expect(words(settlement.querySelector('[data-testid="in-the-grid"]'))).toBe(
      'In the grid now 27.16 kWh',
    );
    expect(words(settlement.querySelector('[data-month="2026-09"]'))).toContain(
      'September 2026 210.80 147.56',
    );
    expect(words(settlement.querySelector('[data-month="2026-10"]'))).toBe(
      'October 2026 no closed day',
    );
    // no money anywhere on the page
    expect(words(page())).not.toMatch(/zł|PLN|€|\$/);
  });

  //HAS-417: the side of the operator beside the house's, a month on one line; nothing of it without such a month
  it('settles the months of the meter of Tauron apart', async () => {
    await fixture.whenStable();
    answerQuery(months, 2026, {
      year: 2026,
      ratio: 0.7,
      months: [
        { month: '2026-09', days: 30, exported: 210.8, credited: 147.56, stored: 27.16 },
        {
          month: '2026-10',
          days: 31,
          exported: 52.1,
          stored: 0,
          elicznikImported: 262.38,
          elicznikExported: 51.06,
          elicznikCredited: 35.74,
          elicznikBalance: 0,
        },
      ],
    });
    await fixture.whenStable();
    const settlement = page().querySelector('[data-testid="energy-settlement"]')!;
    // one table: a month on one line, the house on the left, the meter of Tauron on the right (owner, 2026-11-11)
    expect(words(settlement.querySelector('[data-testid="operator-settlement"]'))).toBe(
      'By the meter of Tauron',
    );
    const operatorOf = (month: string) =>
      [...settlement.querySelectorAll(`[data-month="${month}"] [data-side="operator"]`)]
        .map((cell) => words(cell))
        .join(' ');
    expect(settlement.querySelectorAll('[data-testid="settlement-table"] tbody tr')).toHaveLength(
      2,
    );
    expect(words(settlement.querySelector('[data-month="2026-10"]'))).toMatch(
      /^October 2026 52.10 /,
    );
    expect(operatorOf('2026-10')).toBe('51.06 35.74 262.38 0.00');
    // a month the portal served no day of says so on its own line, never a figure of another month
    expect(operatorOf('2026-09')).toBe('no readings');
    // 0 is what is left, not unknown
    expect(words(settlement.querySelector('[data-testid="operator-in-the-grid"]'))).toBe(
      'In the grid by Tauron 0.00 kWh',
    );

    answerQuery(months, 2026, {
      year: 2026,
      months: [{ month: '2026-09', days: 30, stored: 27.16 }],
    });
    await fixture.whenStable();
    expect(settlement.querySelector('[data-testid="operator-settlement"]')).toBeNull();
  });

  it('asks for the closed days up to yesterday', async () => {
    await fixture.whenStable();
    expect(daysAsked!()).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    answerQuery(days, daysAsked!(), [
      { day: '2026-10-31', solaxYield: 8.1, imported: 31.33, exported: 0.39 },
      { day: '2026-11-01', imported: 34.02, exported: 0.13 },
    ]);
    await fixture.whenStable();
    const facts = page().querySelector('[data-testid="days-facts"]')!;
    // the SOLAX known on a day the SOFAR is not: its bar stands; the meter alone gives no yield, never 0
    expect(words(facts.querySelector('[data-total="solaxYield"]'))).toBe(
      'SOLAX 8.1 kWh (1 of 7 days)',
    );
    expect(words(facts.querySelector('[data-total="sofarYield"]'))).toBe(
      'SOFAR 0.0 kWh (0 of 7 days)',
    );
    expect(words(facts.querySelector('[data-total="imported"]'))).toBe(
      'Taken 65.4 kWh (2 of 7 days)',
    );
  });

  it('reads in Polish', async () => {
    await useLanguage('pl');
    answer(flows, FLOWS);
    expect(words((await card('flow')).querySelector('[data-node="house"]'))).toContain(
      'Dom 1,69 kW',
    );
  });
});
