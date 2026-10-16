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
import { CurrentWeatherStore } from '../../data-access/weather/current-weather-store';
import {
  CurrentWeather,
  StationStatus,
  WeatherApi,
  WeatherHistory,
  WeatherMetric,
} from '../../data-access/weather/weather-api';
import { Weather } from './weather';

// 14:45 in the house (summer time, UTC+2)
const NOW = new Date('2026-10-16T12:45:00Z');

const metric = (value: number | boolean, measuredAt = '2026-10-16T14:44:00', stale = false) => ({
  value,
  measuredAt,
  stale,
});

const WEATHER: CurrentWeather = {
  temperature: metric(16.14),
  dewPoint: metric(5.95),
  humidity: metric(51),
  wind: metric(0.9),
  gust: metric(1.04),
  windDirection: metric(237),
  raining: metric(false),
  precipitation: metric(4311),
  pressure: metric(990.84),
  illuminance: metric(21310),
  uv: metric(1),
  battery: metric(100),
  voltage: metric(5.2),
};

const STATUS: StationStatus = {
  gateway: {
    deviceId: 'shellyplugsg3-0123456789ab',
    reachable: true,
    checkedAt: '2026-10-16T14:43:00',
  },
  lastReadingAt: '2026-10-16T14:44:00',
  silent: false,
};

describe('Weather', () => {
  let current: FakeResource<CurrentWeather | null>;
  let status: FakeResource<StationStatus | null>;
  let histories: Map<WeatherMetric, FakeQueryResource<HistoryRange, WeatherHistory | null>>;
  let charts: RecordedCharts;
  let fixture: ComponentFixture<Weather>;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    current = fakeResource();
    status = fakeResource();
    histories = new Map();
    charts = new RecordedCharts();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        provideChartTesting(charts),
        { provide: CurrentWeatherStore, useValue: { current } },
        {
          provide: WeatherApi,
          useValue: {
            watchStatus: () => status,
            watchHistory: (name: WeatherMetric) => {
              const resource = fakeQueryResource<HistoryRange, WeatherHistory | null>();
              histories.set(name, resource);
              return resource;
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(Weather);
  });

  afterEach(() => vi.useRealTimers());

  const page = () => fixture.nativeElement as HTMLElement;
  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function card(name: string): Promise<HTMLElement> {
    await fixture.whenStable();
    return page().querySelector(`[data-testid="card-${name}"]`) as HTMLElement;
  }

  async function row(name: string, of: string): Promise<string> {
    return words((await card(name)).querySelector(`[data-metric="${of}"]`));
  }

  it('shows every metric in its card, with the age of the reading', async () => {
    answer(current, WEATHER);

    expect(await row('temperature', 'temperature')).toBe('Temperature 16.1 °C');
    expect(await row('temperature', 'dewPoint')).toBe('Dew point 6.0 °C');
    expect(await row('temperature', 'humidity')).toBe('Humidity 51 %');
    expect(await row('wind', 'wind')).toBe('Wind 0.9 m/s');
    expect(await row('wind', 'gust')).toBe('Gusts 1.0 m/s');
    expect(await row('rain', 'raining')).toBe('Rain now None');
    expect(await row('rain', 'precipitation')).toBe('Rain gauge 4,311');
    expect(await row('pressure', 'pressure')).toBe('Pressure 990.8 hPa');
    expect(await row('light', 'illuminance')).toBe('Daylight 21,310 lx');
    expect(await row('light', 'uv')).toBe('UV index 1.0');
    expect(words((await card('temperature')).querySelector('[data-testid="measured"]'))).toBe(
      'Measured 1 min ago',
    );
  });

  // the gauge is a running total whose unit nobody has confirmed: no "mm" is made up
  it('writes the gauge without a unit, and says why', async () => {
    answer(current, { ...WEATHER, precipitation: metric(4311.2) });

    // the gauge counts in tenths
    expect(await row('rain', 'precipitation')).toBe('Rain gauge 4,311.2');
    expect(words(await card('rain'))).toContain('its unit is not confirmed yet');
  });

  it('says where the wind comes from, in words and on the dial', async () => {
    answer(current, WEATHER);

    expect(await row('wind', 'windDirection')).toBe('Direction N from the south-west (237°)');
    // the arrow points where the wind goes: 237 + 180
    expect(
      (await card('wind')).querySelector('app-wind-compass g')?.getAttribute('transform'),
    ).toBe('rotate(57)');
  });

  it('draws no row for a metric the answer leaves out, and says so for a card with none', async () => {
    answer(current, { temperature: WEATHER.temperature });

    expect(await row('temperature', 'temperature')).toBe('Temperature 16.1 °C');
    expect((await card('temperature')).querySelector('[data-metric="humidity"]')).toBeNull();
    expect(words(await card('wind'))).toContain('The station has not reported these yet.');
    expect(words(await card('pressure'))).toContain('The station has not reported these yet.');
  });

  it('marks a stale metric, and the whole card when all of its metrics are', async () => {
    answer(current, {
      ...WEATHER,
      humidity: metric(70, '2026-10-16T13:00:00', true),
      pressure: metric(1001, '2026-10-16T13:00:00', true),
    });

    expect(await row('temperature', 'humidity')).toBe('Humidity out of date 70 %');
    const measured = (await card('pressure')).querySelector('[data-testid="measured"]');
    expect(words(measured)).toBe('Measured 1 hr ago - the station has not been heard since.');
    expect(measured?.classList).toContain('age--alert');
  });

  it('keeps the last values next to the failure of the call', async () => {
    answer(current, WEATHER);
    fail(current, new ApiError('server', 502));

    expect(await row('temperature', 'temperature')).toBe('Temperature 16.1 °C');
    expect(words((await card('temperature')).querySelector('[role="alert"]'))).toContain('502');
  });

  describe('the station', () => {
    it('tells the gateway, the last reading, the battery and the voltage', async () => {
      answer(status, STATUS);
      answer(current, WEATHER);

      expect(await row('station', 'gateway')).toBe('Gateway Answers');
      expect(await row('station', 'lastReading')).toBe('Last heard 1 min ago');
      expect(await row('station', 'battery')).toBe('Battery 100 %');
      expect(await row('station', 'voltage')).toBe('Voltage 5.2 V');
      expect((await card('station')).querySelector('[data-testid="station-silent"]')).toBeNull();
    });

    it('warns when the station is silent, and says what is not known as such', async () => {
      answer(status, { gateway: { deviceId: 'x' }, silent: true });

      expect(words((await card('station')).querySelector('[data-testid="station-silent"]'))).toBe(
        'warning The station has not been heard for 30 minutes.',
      );
      expect(await row('station', 'gateway')).toBe('Gateway Not checked yet');
      expect(await row('station', 'lastReading')).toBe('Last heard Not heard yet');
      // the weather has not answered: no battery is made up
      expect((await card('station')).querySelector('[data-metric="battery"]')).toBeNull();
    });

    // the battery comes with another call: its failure is told on this card too, apart
    it('tells the failure of the weather call beside the battery it would give', async () => {
      answer(status, STATUS);
      answer(current, WEATHER);
      fail(current, new ApiError('server', 502));

      const alert = (await card('station')).querySelector('[role="alert"]');
      expect(words(alert)).toContain('The battery and the voltage could not be read.');
      expect(words(alert)).toContain('502');
      // the status itself answered: the card still says what it says
      expect(await row('station', 'gateway')).toBe('Gateway Answers');
    });

    it('says so when the registry has no station', async () => {
      answer(status, { silent: true });

      expect(await row('station', 'gateway')).toBe('Gateway No station in the registry');
    });

    it('calls a gateway that did not answer so', async () => {
      answer(status, { ...STATUS, gateway: { deviceId: 'x', reachable: false } });

      expect(await row('station', 'gateway')).toBe('Gateway Does not answer');
    });
  });

  describe('the charts', () => {
    it('asks for the history of every metric drawn, once each', async () => {
      await fixture.whenStable();

      expect([...histories.keys()].sort()).toEqual(
        [
          'dewPoint',
          'gust',
          'humidity',
          'illuminance',
          'precipitation',
          'pressure',
          'temperature',
          'wind',
        ].sort(),
      );
      expect(page().querySelectorAll('app-weather-chart-card')).toHaveLength(6);
    });

    // the page is one look at the weather: the period chosen on one chart is that of all
    it('share one period', async () => {
      await fixture.whenStable();
      const week = (chart: string) =>
        [
          ...page().querySelectorAll(`[data-testid="chart-${chart}"] mat-button-toggle button`),
        ].find((button) => button.textContent?.includes('7 days')) as HTMLButtonElement;

      week('pressure').click();
      await fixture.whenStable();

      for (const chart of ['temperature', 'humidity', 'wind', 'illuminance', 'precipitation']) {
        expect(week(chart).closest('mat-button-toggle')?.classList, chart).toContain(
          'mat-button-toggle-checked',
        );
      }
    });

    it('draws a chart once its lines have answered', async () => {
      await fixture.whenStable();
      const range = histories.get('pressure')!;
      // the range the page asked with is what the answer is tagged with
      const asked = (
        fixture.componentInstance as unknown as { period: { range(): HistoryRange } }
      ).period.range();
      answerQuery(range, asked, {
        bucketSeconds: 300,
        points: [{ at: '2026-10-16T14:00:00', avg: 990.5, min: 990.4, max: 990.6 }],
      });
      await fixture.whenStable();
      await vi.waitFor(() => expect(charts.drawn.some((drawn) => drawn !== undefined)).toBe(true));

      const card = page().querySelector('[data-testid="chart-pressure"]');
      expect(words(card?.querySelector('[data-testid="history-facts"]'))).toBe(
        'Pressure 990.5 – 990.5 hPa',
      );
    });
  });

  it('speaks Polish, with a decimal comma', async () => {
    await useLanguage('pl');
    answer(current, WEATHER);

    expect(await row('temperature', 'temperature')).toBe('Temperatura 16,1 °C');
    expect(await row('wind', 'windDirection')).toBe(
      'Kierunek N z kierunku południowo-zachodniego (237°)',
    );
  });
});
