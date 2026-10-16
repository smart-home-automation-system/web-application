import { CurrentWeather } from './weather-api';
import {
  WINDY_FROM_MS,
  compassPoint,
  leadingIcon,
  newestOf,
  toWeatherReading,
} from './weather-reading';

const ZONE = 'Europe/Warsaw';

describe('toWeatherReading', () => {
  it('reads each metric with its value, its time and whether it is stale', () => {
    const reading = toWeatherReading(
      {
        temperature: { value: 16.1, measuredAt: '2026-10-16T14:42:35', stale: false },
        raining: { value: true, measuredAt: '2026-10-16T14:41:34', stale: true },
      },
      ZONE,
    );

    expect(reading.temperature).toEqual({
      value: 16.1,
      measuredAt: '2026-10-16T14:42:35',
      // 14:42:35 in Warsaw is 12:42:35 UTC in summer time
      measuredInstant: Date.UTC(2026, 9, 16, 12, 42, 35),
      stale: false,
    });
    expect(reading.raining?.value).toBe(true);
    expect(reading.raining?.stale).toBe(true);
  });

  // what the answer does not say is not known: never a 0, never "no rain"
  it('leaves out what the answer leaves out, and what is not of its kind', () => {
    const reading = toWeatherReading(
      {
        humidity: { value: Number.NaN },
        wind: { value: '3' as unknown as number },
        raining: { value: 0 as unknown as boolean },
        gust: null as unknown as undefined,
      },
      ZONE,
    );

    expect(reading).toEqual({
      temperature: undefined,
      humidity: undefined,
      dewPoint: undefined,
      wind: undefined,
      gust: undefined,
      illuminance: undefined,
      raining: undefined,
      pressure: undefined,
      uv: undefined,
      windDirection: undefined,
      precipitation: undefined,
      battery: undefined,
      voltage: undefined,
    });
  });

  it('reads nothing from an answer that is no object', () => {
    for (const answer of [
      null,
      undefined,
      [] as unknown as CurrentWeather,
      'x' as unknown as CurrentWeather,
    ]) {
      expect(toWeatherReading(answer, ZONE).temperature).toBeUndefined();
    }
  });

  it('does not make up a time that is no date-time of the house, nor a stale flag', () => {
    const reading = toWeatherReading({ temperature: { value: 3, measuredAt: 'yesterday' } }, ZONE);

    expect(reading.temperature).toEqual({
      value: 3,
      measuredAt: undefined,
      measuredInstant: undefined,
      stale: false,
    });
  });
});

describe('leadingIcon', () => {
  const at = '2026-10-16T14:00:00';

  it('leads with the rain when it rains, whatever the wind', () => {
    const reading = toWeatherReading(
      { raining: { value: true, measuredAt: at }, wind: { value: 15, measuredAt: at } },
      ZONE,
    );
    expect(leadingIcon(reading)).toBe('rainy');
  });

  it(`leads with the wind from ${WINDY_FROM_MS} m/s`, () => {
    const wind = (value: number) =>
      leadingIcon(toWeatherReading({ raining: { value: false }, wind: { value } }, ZONE));

    expect(wind(WINDY_FROM_MS - 0.1)).toBe('device_thermostat');
    expect(wind(WINDY_FROM_MS)).toBe('air');
  });

  it('leads with the thermometer when neither is known', () => {
    expect(leadingIcon(toWeatherReading({}, ZONE))).toBe('device_thermostat');
  });
});

describe('newestOf', () => {
  const reading = toWeatherReading(
    {
      temperature: { value: 9, measuredAt: '2026-10-16T14:00:00', stale: true },
      humidity: { value: 70, measuredAt: '2026-10-16T14:05:00', stale: false },
      wind: { value: 2, stale: false },
    },
    ZONE,
  );

  it('answers the newest time of the metrics given, and whether all of them are stale', () => {
    expect(newestOf([reading.temperature, reading.humidity])).toEqual({
      measuredAt: '2026-10-16T14:05:00',
      allStale: false,
    });
    expect(newestOf([reading.temperature, undefined])).toEqual({
      measuredAt: '2026-10-16T14:00:00',
      allStale: true,
    });
  });

  it('answers nothing when none of them says when it was measured', () => {
    expect(newestOf([reading.wind, undefined])).toBeUndefined();
    expect(newestOf([])).toBeUndefined();
  });
});

describe('compassPoint', () => {
  it.each([
    [0, 'n'],
    [22.4, 'n'],
    [22.5, 'ne'],
    [90, 'e'],
    [180, 's'],
    [237.5, 'sw'],
    [317, 'nw'],
    [337.6, 'n'],
    [360, 'n'],
    [-45, 'nw'],
  ] as const)('reads %s° as %s', (degrees, point) => {
    expect(compassPoint(degrees)).toBe(point);
  });

  it('reads nothing into a value that is no angle', () => {
    expect(compassPoint(Number.NaN)).toBeUndefined();
  });
});
