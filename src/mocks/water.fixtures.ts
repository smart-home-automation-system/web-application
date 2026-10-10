import { WaterHeatingDemand, WaterTemperatures } from '../app/data-access/water/water-api';
import { houseTime } from './house-time';

/**
 * `GET /home/water/status/temperature`, in the shape of a real answer. `pumpActive` is there and
 * always false: the service does not fill it in, and the application does not show it.
 */
export const WATER_TEMPERATURES: WaterTemperatures = {
  water: { temperature: 40.56 },
  circulation: { temperature: 29.81, pumpActive: false },
};

/**
 * The same answer as `water-service` gives it since 0.6.0: with the time the sensors were read,
 * to the second. The service reads them every three minutes, so the reading is a little over a
 * minute old - a function of "now", because the page shows that time as an age. `secondsAgo`
 * is for a sensor that fell silent: the service then repeats its last row.
 */
export function waterTemperatures(now: Date = new Date(), secondsAgo = 65): WaterTemperatures {
  return { measuredAt: houseTime(now, secondsAgo).slice(0, 19), ...WATER_TEMPERATURES };
}

/** `GET /home/water/status/active`: the water is inside its band and was last heated up. */
export const WATER_HEATING_DEMAND: WaterHeatingDemand = { active: false };
