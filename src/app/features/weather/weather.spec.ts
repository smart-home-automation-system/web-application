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

  // HAS-431: the air quality sensor outside, read with the weather; whether there is smog with the status
  describe('the air quality', () => {
    const AIR: CurrentWeather = {
      ...WEATHER,
      pm1: metric(31, '2026-10-16T14:40:00'),
      pm25: metric(42, '2026-10-16T14:40:00'),
      pm10: metric(162, '2026-10-16T14:40:00'),
      airQualityLevel: metric(3, '2026-10-16T14:40:00'),
    };
    const SENSOR = {
      address: '192.0.2.23',
      reachable: true,
      checkedAt: '2026-10-16T14:44:00',
      lastReadingAt: '2026-10-16T14:40:00',
      silent: false,
    };

    it('tells the level of the sensor, PM2.5 and PM10 with the level of each, and PM1', async () => {
      answer(current, AIR);

      const air = await card('air');
      expect(words(air.querySelector('[data-testid="air-level"]'))).toBe('Moderate');
      expect(
        air
          .querySelector('[data-testid="air-level"] app-air-level-dot')
          ?.getAttribute('data-level'),
      ).toBe('3');
      expect(await row('air', 'pm25')).toBe('PM2.5 Moderate 42 µg/m³');
      expect(await row('air', 'pm10')).toBe('PM10 Very bad 162 µg/m³');
      expect(await row('air', 'pm1')).toBe('PM1 31 µg/m³');
      expect(words(air.querySelector('[data-testid="measured"]'))).toBe('Measured 5 min ago');
    });

    // the word is always written: the colour is never the only sign of a level
    it('writes the word of every level beside its colour', async () => {
      answer(current, AIR);

      const air = await card('air');
      for (const level of air.querySelectorAll('.air__level')) {
        expect(words(level)).not.toBe('');
      }
    });

    it('says the level is not known when the sensor gives none, and shows what it measured', async () => {
      answer(current, { ...AIR, airQualityLevel: metric(7) });

      expect(words((await card('air')).querySelector('[data-testid="air-level"]'))).toBe(
        'Level not known',
      );
      expect(await row('air', 'pm10')).toBe('PM10 Very bad 162 µg/m³');
    });

    // a service before 0.5.0, or a sensor not heard since the start: nothing made up
    it('says the sensor has not reported while the answer has none of it', async () => {
      answer(current, WEATHER);

      expect(words(await card('air'))).toContain('The air quality sensor has not reported yet.');
      expect((await card('air')).querySelector('[data-metric="pm10"]')).toBeNull();
    });

    it('says the sensor has not been heard since when every value is stale', async () => {
      answer(current, {
        ...WEATHER,
        pm10: metric(20, '2026-10-16T13:00:00', true),
        airQualityLevel: metric(1, '2026-10-16T13:00:00', true),
      });

      expect(words((await card('air')).querySelector('[data-testid="measured"]'))).toBe(
        'Measured 1 hr ago - the sensor has not been heard since.',
      );
    });

    it('tells an open smog episode of the status', async () => {
      answer(current, AIR);
      answer(status, {
        ...STATUS,
        airSensor: { ...SENSOR, smog: { since: '2026-10-16T13:30:00', level: 6 } },
      });

      expect(words((await card('air')).querySelector('[data-testid="air-smog"]'))).toBe(
        'masks Smog outside since 13:30 - the household was told.',
      );
    });

    it('tells the smog without its start when the start is no time of the house', async () => {
      answer(current, AIR);
      answer(status, { ...STATUS, airSensor: { ...SENSOR, smog: { since: 'soon', level: 6 } } });

      expect(words((await card('air')).querySelector('[data-testid="air-smog"]'))).toBe(
        'masks Smog outside - the household was told.',
      );
    });

    it('tells nothing of smog while the status names none', async () => {
      answer(current, AIR);
      answer(status, { ...STATUS, airSensor: SENSOR });

      expect((await card('air')).querySelector('[data-testid="air-smog"]')).toBeNull();
    });

    // the status is a call of its own: its failure is told on the card, apart from the readings
    it('tells that whether there is smog could not be read', async () => {
      answer(current, AIR);
      fail(status, new ApiError('server', 502));

      expect(words(await card('air'))).toContain('Whether there is smog could not be read.');
      expect(await row('air', 'pm10')).toBe('PM10 Very bad 162 µg/m³');
    });

    it('tells on the station card whether the sensor answers, and its silence', async () => {
      answer(status, { ...STATUS, airSensor: { ...SENSOR, reachable: false, silent: true } });

      expect(await row('station', 'airSensor')).toBe('Air quality sensor Does not answer');
      expect(
        words((await card('station')).querySelector('[data-testid="air-sensor-silent"]')),
      ).toBe('warning The air quality sensor has had no valid reading for 30 minutes.');
    });

    it('names no sensor on the station card while the status has none', async () => {
      answer(status, STATUS);

      expect((await card('station')).querySelector('[data-metric="airSensor"]')).toBeNull();
      expect((await card('station')).querySelector('[data-testid="air-sensor-silent"]')).toBeNull();
    });

    // a chart per fraction (the owner on the PR): each drawn alone, with the thresholds of its own scale
    async function answerAir(values: Partial<Record<'pm1' | 'pm25' | 'pm10', number>>) {
      await fixture.whenStable();
      const asked = (
        fixture.componentInstance as unknown as { period: { range(): HistoryRange } }
      ).period.range();
      for (const [name, value] of Object.entries(values)) {
        answerQuery(histories.get(name as WeatherMetric)!, asked, {
          bucketSeconds: 300,
          points: [{ at: '2026-10-16T14:00:00', avg: value, min: 1, max: 99 }],
        });
      }
      await fixture.whenStable();
    }
    /** The lines of the one chart drawn: the others have no answer. */
    async function drawnLines(): Promise<string[]> {
      const index = () => charts.drawn.findIndex((drawn) => drawn !== undefined);
      await vi.waitFor(() => expect(index()).toBeGreaterThanOrEqual(0));
      return charts.lines(index()).map((line) => line.name);
    }

    it('draws PM10 alone with the two thresholds of its scale, left out of the numbers', async () => {
      await answerAir({ pm10: 64 });

      expect(await drawnLines()).toEqual(
        expect.arrayContaining(['PM10', 'Moderate from', 'Bad from']),
      );
      expect(
        words(page().querySelector('[data-testid="chart-pm10"] [data-testid="history-facts"]')),
      ).toBe('PM10 64 – 64 µg/m³');
    });

    it('draws PM2.5 alone with the thresholds of PM2.5, 35 and 75', async () => {
      await answerAir({ pm25: 41 });

      await drawnLines();
      const lines = charts.lines(charts.drawn.findIndex((drawn) => drawn !== undefined));
      const at = (name: string) =>
        (lines.find((line) => line.name === name)?.data[0] as [number, number] | undefined)?.[1];
      expect(at('Moderate from')).toBe(35);
      expect(at('Bad from')).toBe(75);
    });

    it('draws PM1 alone, with no threshold - the index has none for it', async () => {
      await answerAir({ pm1: 80 });

      expect(await drawnLines()).toEqual(['PM1']);
    });

    // a clean week keeps its own axis: a threshold is drawn once the readings reach half of it
    it('draws only the thresholds the readings come near', async () => {
      await answerAir({ pm10: 30 });

      const names = await drawnLines();
      expect(names).toContain('Moderate from');
      expect(names).not.toContain('Bad from');
    });

    it('draws no threshold while no line has anything to draw', async () => {
      await fixture.whenStable();
      const asked = (
        fixture.componentInstance as unknown as { period: { range(): HistoryRange } }
      ).period.range();
      answerQuery(histories.get('pm10')!, asked, { bucketSeconds: 300, points: [] });
      await fixture.whenStable();

      expect(words(page().querySelector('[data-testid="chart-pm10"]'))).toContain(
        'No reading in this period.',
      );
    });

    it('speaks Polish', async () => {
      await useLanguage('pl');
      answer(current, AIR);

      expect(words((await card('air')).querySelector('[data-testid="air-level"]'))).toBe(
        'Umiarkowana',
      );
      expect(await row('air', 'pm25')).toBe('PM2,5 Umiarkowana 42 µg/m³');
      expect(await row('air', 'pm10')).toBe('PM10 Bardzo zła 162 µg/m³');
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
          'pm1',
          'pm10',
          'pm25',
          'precipitation',
          'pressure',
          'temperature',
          'wind',
        ].sort(),
      );
      expect(page().querySelectorAll('app-weather-chart-card')).toHaveLength(9);
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
