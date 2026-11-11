import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';

import { RecordedCharts, provideChartTesting } from '../../../testing/chart';
import {
  FakeQueryResource,
  answerQuery,
  failQuery,
  fakeQueryResource,
} from '../../../testing/fake-resource';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { DaysQuery, ElicznikDays, EnergyApi, EnergyDay } from '../../data-access/energy/energy-api';
import { EnergyOperator } from './energy-operator';

const NOW = new Date('2026-11-11T09:00:00Z');

//the week of 2026-11-04..10 as production answered it on 2026-11-11 (energy-service 0.17.0), the last day not yet served
const DAYS: EnergyDay[] = [
  {
    day: '2026-11-08',
    imported: 17.07,
    exported: 0.6,
    elicznikImport: 17.223,
    elicznikExport: 0.598,
  },
  {
    day: '2026-11-09',
    imported: 15.79,
    exported: 0.61,
    elicznikImport: 15.915,
    elicznikExport: 0.603,
  },
  { day: '2026-11-10', imported: 35.56, exported: 0.37 },
];

const BACK: ElicznikDays = {
  from: '2026-11-08',
  to: '2026-11-08',
  days: [
    {
      day: '2026-11-08',
      imported: 4.237,
      exported: 0.046,
      meterImported: 2777,
      meterExported: 4872,
      hours: [
        { hour: 1, repeated: false, imported: 1.558, exported: 0 },
        { hour: 3, repeated: true, imported: 1.392, exported: 0 },
        { hour: 3, repeated: false, imported: 1.287, exported: 0.046 },
      ],
    },
  ],
};

describe('EnergyOperator', () => {
  let days: FakeQueryResource<DaysQuery, readonly EnergyDay[] | null>;
  let daysAsked: () => DaysQuery;
  let elicznik: FakeQueryResource<string, ElicznikDays | null>;
  let dayAsked: () => string;
  let charts: RecordedCharts;
  let fixture: ComponentFixture<EnergyOperator>;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    days = fakeQueryResource();
    elicznik = fakeQueryResource();
    charts = new RecordedCharts();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        provideChartTesting(charts),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        {
          provide: EnergyApi,
          useValue: {
            watchDays: (query: () => DaysQuery) => {
              daysAsked = query;
              return days;
            },
            watchElicznikDay: (day: () => string) => {
              dayAsked = day;
              return elicznik;
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(EnergyOperator);
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    vi.useRealTimers();
  });

  const page = () => fixture.nativeElement as HTMLElement;
  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const dialog = () =>
    document.querySelector('[data-testid="elicznik-day"]')?.closest('mat-dialog-container');

  it('sets the meter of Tauron beside the 3EM, the newest day first, a day not served yet "not yet"', async () => {
    await fixture.whenStable();
    expect(daysAsked()).toEqual({ from: '2026-11-04', to: '2026-11-10' });
    answerQuery(days, daysAsked(), DAYS);
    await fixture.whenStable();

    const rows = [...page().querySelectorAll('[data-testid="operator-table"] tbody tr')];
    expect(rows.map((row) => row.getAttribute('data-day'))).toEqual([
      '2026-11-10',
      '2026-11-09',
      '2026-11-08',
      '2026-11-07',
      '2026-11-06',
      '2026-11-05',
      '2026-11-04',
    ]);
    expect(words(rows[0])).toBe('Tue 10 Nov 35.56 not yet – 0.37 not yet –');
    expect(words(rows[2])).toBe('Sun 8 Nov 17.07 17.22 +0.9 % 0.60 0.60 -0.3 % bar_chart');
    // a day the answer leaves out has no figures, never 0
    expect(words(rows[3])).toBe('Sat 7 Nov – not yet – – not yet –');
    expect(words(page().querySelector('[data-testid="operator-total"]'))).toBe(
      'Days of both (2) 32.86 33.14 +0.8 % 1.21 1.20 -0.7 %',
    );
    // only a day with values of the operator opens its hours
    expect(page().querySelectorAll('[data-testid="operator-hours"]')).toHaveLength(2);
  });

  it('has nothing to show while no day has the operator', async () => {
    await fixture.whenStable();
    answerQuery(days, daysAsked(), [{ day: '2026-11-10', imported: 35.56, exported: 0.37 }]);
    await fixture.whenStable();

    expect(page().querySelector('[data-testid="operator-table"]')).toBeNull();
  });

  it('tells a failure in the card', async () => {
    await fixture.whenStable();
    failQuery(days, daysAsked(), new ApiError('server', 503));
    await fixture.whenStable();

    expect(page().querySelector('app-api-error-strip')).not.toBeNull();
  });

  it('opens the hours of a day, the two hours 3 of the night the clocks go back apart', async () => {
    await fixture.whenStable();
    answerQuery(days, daysAsked(), DAYS);
    await fixture.whenStable();
    page().querySelectorAll<HTMLButtonElement>('[data-testid="operator-hours"]')[1].click();
    await fixture.whenStable();

    expect(dayAsked()).toBe('2026-11-08');
    answerQuery(elicznik, '2026-11-08', BACK);
    await fixture.whenStable();
    expect(words(dialog()?.querySelector('[data-testid="elicznik-day-title"]'))).toBe(
      'The meter of Tauron, Sun 8 Nov',
    );
    expect((charts.drawn.at(-1)?.['xAxis'] as { data: unknown }).data).toEqual([
      '00:00',
      '02:00 (1)',
      '02:00 (2)',
    ]);
    expect(words(dialog()?.querySelector('[data-testid="elicznik-registers"]'))).toBe(
      'Registers at the end of the day taken 2,777 kWh, returned 4,872 kWh',
    );
    expect(words(dialog())).toContain('The clocks went back that night');
  });

  it('reads in Polish', async () => {
    await useLanguage('pl');
    await fixture.whenStable();
    answerQuery(days, daysAsked(), DAYS);
    await fixture.whenStable();

    const rows = [...page().querySelectorAll('[data-testid="operator-table"] tbody tr')];
    expect(words(rows[0])).toContain('jeszcze nie');
    expect(words(rows[2])).toContain('17,22 +0,9 %');
  });
});
