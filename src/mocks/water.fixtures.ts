import { WaterHeatingDemand, WaterTemperatures } from '../app/data-access/water/water-api';

/**
 * `GET /home/water/status/temperature`, in the shape of a real answer. `pumpActive` is there and
 * always false: the service does not fill it in, and the application does not show it.
 */
export const WATER_TEMPERATURES: WaterTemperatures = {
  water: { temperature: 40.56 },
  circulation: { temperature: 29.81, pumpActive: false },
};

/** `GET /home/water/status/active`: the water is inside its band and was last heated up. */
export const WATER_HEATING_DEMAND: WaterHeatingDemand = { active: false };
