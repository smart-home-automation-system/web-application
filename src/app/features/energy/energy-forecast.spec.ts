import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecordedCharts, provideChartTesting } from '../../../testing/chart';
import { FakeResource, answer, fail, fakeResource } from '../../../testing/fake-resource';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { EnergyApi, EnergyForecast } from '../../data-access/energy/energy-api';
import { EnergyForecastCard } from './energy-forecast';

// 10:30 in the house on Wednesday 4 November 2026 (winter time, UTC+1)
const NOW = new Date('2026-11-04T09:30:00Z');

const FORECAST: EnergyForecast = {
  fetchedAt: '2026-11-04T10:02:35',
  stale: false,
  houseLoadKwh: 24.6,
  houseLoadDays: 7,
  performanceRatio: {
    solax: { ratio: 0.62, calibratedOnDays: 9 },
    sofar: { ratio: 0.8, calibratedOnDays: 0 },
  },
  days: [
    {
      day: '2026-11-04',
      solaxKwh: 4.3,
      sofarKwh: 2.5,
      totalKwh: 6.8,
      coverage: 0.28,
      category: 'poor',
      sunshineHours: 1,
    },
    {
      day: '2026-11-05',
      solaxKwh: 1.1,
      sofarKwh: 0.7,
      totalKwh: 1.8,
      coverage: 0.07,
      category: 'none',
    },
    {
      day: '2026-11-06',
      solaxKwh: 3.9,
      sofarKwh: 2.4,
      totalKwh: 6.3,
      coverage: 0.26,
      category: 'poor',
    },
    {
      day: '2026-11-07',
      solaxKwh: 17.8,
      sofarKwh: 10.6,
      totalKwh: 28.4,
      coverage: 1.15,
      category: 'good',
    },
    { day: '2026-11-08' },
  ],
  past: [
    {
      day: '2026-11-03',
      solax: { forecastKwh: 6.2, actualKwh: 5.4 },
      sofar: { forecastKwh: 3.8, actualKwh: 3.1 },
    },
  ],
  hourly: [
    { hour: '2026-11-04T10:00:00', solaxKw: 1.5, sofarKw: 0.8, cloudCover: 90 },
    { hour: '2026-11-04T11:00:00', solaxKw: 2.1, sofarKw: 1.2, cloudCover: 85 },
  ],
  outlook: { sunBackOn: '2026-11-07', daysWithoutSun: 3 },
};

describe('EnergyForecastCard', () => {
  let forecast: FakeResource<EnergyForecast | null>;
  let charts: RecordedCharts;
  let fixture: ComponentFixture<EnergyForecastCard>;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    forecast = fakeResource();
    charts = new RecordedCharts();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        provideChartTesting(charts),
        { provide: EnergyApi, useValue: { watchForecast: () => forecast } },
      ],
    });
    fixture = TestBed.createComponent(EnergyForecastCard);
  });

  afterEach(() => vi.useRealTimers());

  const card = async () => {
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };
  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const day = async (date: string) => (await card()).querySelector(`[data-day="${date}"]`);

  it('says when the sun comes back, with the kWh of that day against the house load', async () => {
    answer(forecast, FORECAST);

    expect(words((await card()).querySelector('[data-testid="forecast-outlook"]'))).toBe(
      'Little production for 3 days, better on Saturday (about 28 kWh, above the house load)',
    );
    await useLanguage('pl');
    expect(words((await card()).querySelector('[data-testid="forecast-outlook"]'))).toBe(
      'Przez 3 dni słaba produkcja, poprawa w sobotę (ok. 28 kWh, ponad zużycie domu)',
    );
  });

  it('gives every day its kWh, the category of the service in words and the share of the house load', async () => {
    answer(forecast, FORECAST);

    expect(words(await day('2026-11-04'))).toBe('Today Poor 6.8 kWh 28 % of the house 1 h of sun');
    expect(words(await day('2026-11-05'))).toContain('Tomorrow None 1.8 kWh 7 % of the house');
    expect((await day('2026-11-07'))?.getAttribute('data-category')).toBe('good');
    // the days from the fourth on are paler
    expect((await day('2026-11-07'))?.classList).toContain('forecast__day--pale');
    expect((await day('2026-11-06'))?.classList).not.toContain('forecast__day--pale');
  });

  it('says a day the service left out is not known, and draws no bar for it', async () => {
    answer(forecast, FORECAST);

    const unknown = await day('2026-11-08');
    expect(words(unknown)).toContain('Not judged');
    expect(words(unknown)).toContain('not known');
    unknown
      ?.querySelectorAll<HTMLElement>('.forecast__stack .forecast__bar')
      .forEach((bar) => expect(bar.style.height).toBe('0%'));
  });

  it('puts the closed day beside, what the forecast gave next to what was produced', async () => {
    answer(forecast, FORECAST);

    const past = await day('2026-11-03');
    expect(past?.classList).toContain('forecast__day--past');
    expect(words(past)).toContain('Produced 8.5 kWh forecast 10.0 kWh');
  });

  it('draws the house load as a line at its height in every column', async () => {
    answer(forecast, FORECAST);

    const lines = (await card()).querySelectorAll<HTMLElement>('.forecast__load');
    // one per column: a closed day and five days
    expect(lines.length).toBe(6);
    // the largest amount is the 28.4 kWh of Saturday
    expect(lines[0].style.bottom).toBe(`${(24.6 / 28.4) * 100}%`);
    expect(words((await card()).querySelector('[data-testid="forecast-house-load"]'))).toBe(
      'House load, mean of 7 days: 24.6 kWh',
    );
  });

  it('draws the next 48 hours, a line per inverter', async () => {
    answer(forecast, FORECAST);
    await card();

    await vi.waitFor(() => expect(charts.drawn[0]).toBeDefined());
    // the lines, then no gap bridge: the two hours are one hour apart
    expect(
      charts
        .lines()
        .map((line) => line.name)
        .filter((name) => name !== undefined),
    ).toEqual(expect.arrayContaining(['SOLAX', 'SOFAR']));
  });

  it('tells the performance ratio of each inverter, and which is still the initial one', async () => {
    answer(forecast, FORECAST);

    expect(words((await card()).querySelector('[data-testid="forecast-ratios"]'))).toBe(
      'Performance ratio: SOLAX 0.62 (9 days), SOFAR 0.80 (initial)',
    );
  });

  it('says a forecast the service has not fetched for hours is out of date', async () => {
    answer(forecast, { ...FORECAST, stale: true });
    expect(words((await card()).querySelector('[data-testid="forecast-stale"]'))).toContain(
      'The forecast is out of date, last fetched',
    );

    answer(forecast, { stale: true, days: [], past: [], hourly: [] });
    expect(words((await card()).querySelector('[data-testid="forecast-stale"]'))).toBe(
      'The forecast has not been fetched since the service started',
    );
    expect(words((await card()).querySelector('[data-testid="forecast-none"]'))).toBe(
      'No forecast is stored yet.',
    );
    expect(words((await card()).querySelector('[data-testid="forecast-outlook"]'))).toBe(
      'The days are not judged yet: no closed day with the house load',
    );
  });

  it('tells a failed call in the card - a 404 of a service below the release too', async () => {
    fail(forecast, new ApiError('client', 404));

    expect((await card()).querySelector('app-api-error-strip:not(:empty)')).not.toBeNull();
  });
});
