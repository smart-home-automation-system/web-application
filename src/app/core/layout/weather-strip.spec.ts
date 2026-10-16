import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatTooltip } from '@angular/material/tooltip';
import { By } from '@angular/platform-browser';

import { FakeResource, answer, fail, fakeResource } from '../../../testing/fake-resource';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { CurrentWeather, WeatherApi } from '../../data-access/weather/weather-api';
import { ApiError } from '../api/api-error';
import { WeatherStrip } from './weather-strip';

// 14:45 in the house (summer time, UTC+2)
const NOW = new Date('2026-10-16T12:45:00Z');

const WEATHER: CurrentWeather = {
  temperature: { value: 16.14, measuredAt: '2026-10-16T14:42:35', stale: false },
  humidity: { value: 51.4, measuredAt: '2026-10-16T14:42:10', stale: false },
  raining: { value: false, measuredAt: '2026-10-16T14:41:34', stale: false },
  wind: { value: 0.9, measuredAt: '2026-10-16T14:42:26', stale: false },
};

describe('WeatherStrip', () => {
  let weather: FakeResource<CurrentWeather | null>;
  let fixture: ComponentFixture<WeatherStrip>;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    weather = fakeResource();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: WeatherApi, useValue: { watchCurrent: () => weather } },
      ],
    });
    fixture = TestBed.createComponent(WeatherStrip);
  });

  afterEach(() => vi.useRealTimers());

  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function strip(): Promise<HTMLElement | null> {
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).querySelector('[data-testid="weather-strip"]');
  }

  const icon = async () => words((await strip())?.querySelector('.weather__icon'));
  const tooltip = () =>
    fixture.debugElement.query(By.directive(MatTooltip))?.injector.get(MatTooltip);

  it('draws nothing until the first call has answered', async () => {
    expect(await strip()).toBeNull();
  });

  it('shows the temperature, the humidity and the age of the reading', async () => {
    answer(weather, WEATHER);

    const shown = await strip();
    expect(shown?.getAttribute('role')).toBe('group');
    expect(shown?.getAttribute('aria-label')).toBe('Weather outside');
    expect(words(shown?.querySelector('[data-testid="weather-temperature"]'))).toBe('16.1 °C');
    // the word is for a screen reader: on screen the number speaks for itself
    expect(words(shown?.querySelector('[data-testid="weather-humidity"]'))).toBe('humidity 51 %');
    // the newest of the two readings shown, 14:42:35
    expect(words(shown?.querySelector('[data-testid="weather-age"]'))).toBe('2 min ago');
    expect(await icon()).toBe('device_thermostat');
  });

  it('leads with the rain while it rains, and says so to a screen reader', async () => {
    answer(weather, { ...WEATHER, raining: { value: true, measuredAt: '2026-10-16T14:44:00' } });

    expect(await icon()).toBe('rainy');
    expect(words(await strip())).toContain('Raining');
  });

  it('leads with the wind when it is strong', async () => {
    answer(weather, { ...WEATHER, wind: { value: 11.2, measuredAt: '2026-10-16T14:44:00' } });

    expect(await icon()).toBe('air');
    expect(words(await strip())).toContain('Strong wind');
  });

  it('draws nothing for a metric the answer leaves out', async () => {
    answer(weather, { temperature: WEATHER.temperature });

    const shown = await strip();
    expect(shown?.querySelector('[data-testid="weather-temperature"]')).toBeTruthy();
    expect(shown?.querySelector('[data-testid="weather-humidity"]')).toBeNull();
  });

  it('marks the age once the station has not confirmed what the strip shows', async () => {
    answer(weather, {
      temperature: { value: 9.5, measuredAt: '2026-10-16T13:30:00', stale: true },
      humidity: { value: 80, measuredAt: '2026-10-16T13:30:00', stale: true },
    });

    const age = (await strip())?.querySelector('[data-testid="weather-age"]');
    expect(age?.classList).toContain('weather__age--stale');
    expect(words(age)).toBe('warning 1 hr ago The station has not been heard since.');
  });

  it('marks the age, and says why, when the call is late though the station is not', async () => {
    answer(weather, WEATHER);
    weather.stale.set(true);

    const age = (await strip())?.querySelector('[data-testid="weather-age"]');
    expect(age?.classList).toContain('weather__age--stale');
    expect(words(age)).toBe('warning 2 min ago The weather has not been updated since.');
  });

  // a failure is no card: the strip becomes an icon, and its tooltip tells why
  it('collapses to an icon with the reason in its tooltip when the call fails', async () => {
    answer(weather, WEATHER);
    fail(weather, new ApiError('network', 0));

    const shown = await strip();
    expect(shown?.tagName).toBe('BUTTON');
    expect(shown?.querySelector('[data-testid="weather-temperature"]')).toBeNull();
    expect(words(shown)).toBe('cloud_off');
    expect(tooltip()?.message).toBe(
      'The weather could not be read. The server cannot be reached. Check the Wi-Fi or VPN connection.',
    );
    expect(tooltip()?.touchGestures).toBe('off');
  });

  it('opens its tooltip on a tap, for a phone', async () => {
    fail(weather, new ApiError('server', 502));
    const button = (await strip()) as HTMLButtonElement;
    const tip = tooltip() as MatTooltip;
    const show = vi.spyOn(tip, 'show');

    button.click();

    // show, not toggle: on a desktop the pointer has opened it already, and a click must not
    // close what it came to read
    expect(show).toHaveBeenCalledOnce();
  });

  it('collapses with "no reading yet" when the station was heard of nothing', async () => {
    answer(weather, {});

    expect((await strip())?.tagName).toBe('BUTTON');
    expect(tooltip()?.message).toBe('No reading from the weather station yet.');
  });

  it('speaks Polish, with a decimal comma', async () => {
    await useLanguage('pl');
    answer(weather, WEATHER);

    const shown = await strip();
    expect(shown?.getAttribute('aria-label')).toBe('Pogoda na zewnątrz');
    expect(words(shown?.querySelector('[data-testid="weather-temperature"]'))).toBe('16,1 °C');
    expect(words(shown?.querySelector('[data-testid="weather-humidity"]'))).toBe('wilgotność 51 %');
  });
});
