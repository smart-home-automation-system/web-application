import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { provideRouter } from '@angular/router';

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
  Appliance,
  ApplianceApi,
  ApplianceSample,
  RunsOf,
  RunsQuery,
} from '../../data-access/appliance/appliance-api';
import { ApplianceStore } from '../../data-access/appliance/appliance-store';
import { DeviceRegistryApi, SmartDevice } from '../../data-access/devices/device-registry-api';
import { Appliances } from './appliances';

// 21:30 in the house (Europe/Warsaw)
const NOW = Date.parse('2026-10-26T20:30:00Z');

const APPLIANCES: readonly Appliance[] = [
  { id: 131, name: 'Washing machine', room: 'boiler', state: 'running', runningSince: '2026-10-26T21:00:00' },
  { id: 132, name: 'Dryer', room: 'bathroom up', state: 'idle' },
];

const REGISTRY: readonly SmartDevice[] = [
  {
    id: 131,
    name: 'Washing machine',
    kind: 'appliance',
    appliance: {
      runningAboveWatts: 20,
      idleBelowWatts: 5,
      minRunMinutes: 20,
      finishedAfterMinutes: 5,
      reminderEveryMinutes: 30,
      maxReminders: 4,
      quietFrom: '23:00',
      quietTo: '07:00',
    },
  },
];

const WASHER_RUNS = [
  { id: 1, startedAt: '2026-10-26T21:00:00' },
  { id: 2, startedAt: '2026-10-24T10:00:00', finishedAt: '2026-10-24T11:30:00', energyWh: 760 },
  { id: 3, startedAt: '2026-10-22T10:00:00', finishedAt: '2026-10-22T11:30:00' },
  {
    id: 4,
    startedAt: '2026-10-10T10:00:00',
    finishedAt: '2026-10-10T11:25:00',
    energyWh: 820,
    acknowledgedAt: '2026-10-10T11:40:00',
    acknowledgedBy: 'Anna',
  },
];

describe('Appliances', () => {
  let fixture: ComponentFixture<Appliances>;
  let appliances: FakeResource<readonly Appliance[] | null>;
  let registry: FakeResource<readonly SmartDevice[] | null>;
  let runs: FakeQueryResource<RunsQuery, readonly RunsOf[]>;
  let samples: Map<number, FakeQueryResource<HistoryRange, readonly ApplianceSample[] | null>>;
  let ranges: Map<number, () => HistoryRange>;
  let charts: RecordedCharts;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    appliances = fakeResource();
    registry = fakeResource();
    runs = fakeQueryResource();
    samples = new Map();
    ranges = new Map();
    charts = new RecordedCharts();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        provideChartTesting(charts),
        provideRouter([]),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: ApplianceStore, useValue: { appliances } },
        { provide: DeviceRegistryApi, useValue: { watchKind: () => registry } },
        {
          provide: ApplianceApi,
          useValue: {
            watchRunsOf: () => runs,
            watchSampleHistory: (id: () => number, range: () => HistoryRange) => {
              const resource = fakeQueryResource<HistoryRange, readonly ApplianceSample[] | null>();
              // the id is an input of the card: read once the card is made, as the real call does
              queueMicrotask(() => {
                samples.set(id(), resource);
                ranges.set(id(), range);
              });
              return resource;
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(Appliances);
  });

  afterEach(() => vi.useRealTimers());

  const page = () => fixture.nativeElement as HTMLElement;
  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const card = (id: number) => page().querySelector(`[data-testid="appliance-${id}"]`);
  const counter = (scope: Element | null, period: string) =>
    words(scope?.querySelector(`[data-period="${period}"]`));

  async function answered(of: readonly RunsOf[]): Promise<void> {
    answer(appliances, APPLIANCES);
    answer(registry, REGISTRY);
    await fixture.whenStable();
    answerQuery(runs, { ids: [131, 132], range: { from: '2026-09-27T00:00:00', to: '2026-10-27T00:00:00' } }, of);
    await fixture.whenStable();
  }

  // HAS-283: by the start of a cycle; the energy of the finished ones, never 0 Wh for one not known
  it('counts the cycles and the energy of 24 hours, 7 and 30 days', async () => {
    await answered([{ id: 131, runs: WASHER_RUNS }, { id: 132, runs: [] }]);

    expect(counter(card(131), 'day')).toBe('24 hours Cycles: 1 – Still running: 1');
    expect(counter(card(131), 'week')).toBe('7 days Cycles: 3 760 Wh Energy not known: 1 Still running: 1');
    expect(counter(card(131), 'month')).toBe('30 days Cycles: 4 1.58 kWh Energy not known: 1 Still running: 1');
    expect(counter(page().querySelector('[data-testid="house-counters"]'), 'month')).toBe(
      '30 days Cycles: 4 1.58 kWh Energy not known: 1 Still running: 1',
    );
  });

  it('lists the cycles of 7 or 30 days, the newest first, with who emptied them', async () => {
    await answered([{ id: 131, runs: WASHER_RUNS }, { id: 132, runs: [] }]);
    const listed = () => [...(card(131)?.querySelectorAll('[data-testid="run"]') ?? [])].map(words);

    expect(listed()).toHaveLength(3);
    expect(listed()[0]).toContain('still running');
    expect(listed()[2]).toContain('energy not known');

    const month = [...page().querySelectorAll('[data-testid="runs-period"] button')][1] as HTMLButtonElement;
    month.click();
    await fixture.whenStable();

    expect(listed()).toHaveLength(4);
    expect(listed()[3]).toContain('820 Wh');
    expect(listed()[3]).toContain('emptied after 15 min · Anna');
    expect(words(card(132)?.querySelector('[data-testid="appliance-runs"]'))).toContain('No cycle in this period.');
  });

  it('shows the settings of the registry read only, and says when it has none', async () => {
    await answered([{ id: 131, runs: [] }, { id: 132, runs: [] }]);

    const settings = words(card(131)?.querySelector('[data-testid="appliance-settings"]'));
    expect(settings).toContain('Running above 20 W');
    expect(settings).toContain('Reminders every 30 min, at most 4');
    expect(settings).toContain('Quiet hours 23:00–07:00');
    expect(page().querySelectorAll('input, select, mat-slide-toggle')).toHaveLength(0);
    expect(words(card(132)?.querySelector('[data-testid="appliance-settings"]'))).toContain(
      'The device registry did not answer with the settings of this appliance.',
    );
  });

  // one failed call is the failure of its appliance, and the house is not the whole house then
  it('tells a failed call of the cycles on its card and leaves it out of the house', async () => {
    await answered([
      { id: 131, runs: WASHER_RUNS },
      { id: 132, error: new ApiError('server', 502, [{ message: 'Bad Gateway' }]) },
    ]);

    expect(card(132)?.querySelector('app-api-error-strip [role="alert"], app-api-error-strip .strip')).not.toBeNull();
    expect(page().querySelector('[data-testid="house-incomplete"]')).not.toBeNull();
    expect(counter(page().querySelector('[data-testid="house-counters"]'), 'week')).toContain('Cycles: 3');
  });

  // the two thresholds of the settings drawn across the draw, so that a pause can be seen against them
  it('draws the power of the plug with its two thresholds', async () => {
    await answered([{ id: 131, runs: [] }, { id: 132, runs: [] }]);
    await fixture.whenStable();
    const washer = samples.get(131)!;
    const range = ranges.get(131)!();
    answerQuery(washer, range, [
      { at: '2026-10-26T21:00:00', watts: 2100 },
      { at: '2026-10-26T21:00:30', watts: 1.5 },
    ]);
    await fixture.whenStable();
    await vi.waitFor(() => expect(charts.lines(0).length).toBe(3));

    expect(charts.lines(0).map((line) => line.name)).toEqual(['Power', 'Running above', 'Idle below']);
    expect(words(page().querySelector('[data-testid="power-131"] [data-testid="power-facts"]'))).toBe(
      'Drawn 2 – 2,100 W Running above 20 W Idle below 5 W',
    );
  });

  it('asks the last 48 hours when that period is chosen', async () => {
    await answered([{ id: 131, runs: [] }, { id: 132, runs: [] }]);
    await fixture.whenStable();

    expect(ranges.get(131)!()).toEqual({ from: '2026-10-25T22:00:00', to: '2026-10-26T22:00:00' });
    const twoDays = [...page().querySelectorAll('[data-testid="power-131"] mat-button-toggle button')][1] as HTMLButtonElement;
    twoDays.click();
    await fixture.whenStable();

    expect(ranges.get(131)!()).toEqual({ from: '2026-10-24T22:00:00', to: '2026-10-26T22:00:00' });
  });
});
