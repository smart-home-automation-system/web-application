import { CurrentWeather, StationStatus } from '../app/data-access/weather/weather-api';
import { houseTime } from './house-time';

/** A `LocalDateTime` of the house without fractions, as `weather-service` prints it. */
const at = (now: Date, secondsAgo: number) => houseTime(now, secondsAgo).slice(0, 19);

/**
 * `GET /home/weather/current`, in the shape of a real answer: every metric of the station with
 * the time it was last confirmed - a function of "now", because the strip and the tile show
 * that time as an age. A dry, calm autumn afternoon; the values are invented. `secondsAgo` is
 * for a station that fell silent: the service then keeps the last values and marks them stale
 * after 30 minutes.
 */
export function currentWeather(now: Date = new Date(), secondsAgo = 65): CurrentWeather {
  const stale = secondsAgo > 30 * 60;
  const metric = (value: number | boolean, extra = 0) => ({
    value,
    measuredAt: at(now, secondsAgo + extra),
    stale,
  });
  return {
    battery: metric(98, 40),
    pressure: metric(1013.4, 20),
    illuminance: metric(18450.0),
    dewPoint: metric(7.42),
    voltage: metric(5.1, 40),
    raining: metric(false, 30),
    humidity: metric(63),
    wind: metric(2.4),
    gust: metric(3.8),
    temperature: metric(14.3),
    uv: metric(2.0, 30),
    windDirection: metric(245.0),
    precipitation: metric(1287, 40),
  };
}

/** The station is heard: its gateway answered the last read a moment ago. */
export function stationStatus(now: Date = new Date()): StationStatus {
  return {
    gateway: { deviceId: 'shellyplugsg3-0123456789ab', reachable: true, checkedAt: at(now, 95) },
    lastReadingAt: at(now, 65),
    silent: false,
  };
}

/** Just after a start of the service: nothing heard yet, which it reports as silence. */
export const STATION_STATUS_BEFORE_FIRST_READING: StationStatus = { silent: true };
