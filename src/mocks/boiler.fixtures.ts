import { BoilerStatus } from '../app/data-access/boiler/boiler-api';
import { houseTime } from './house-time';

/**
 * `GET /home/boiler/status`, in the shape of a real answer: the furnace burns for the heating,
 * the hot-water pump stands. The timestamps are worked out when the answer is asked for - the
 * service notes every device once a minute, and a fixed time would read as a boiler room that
 * stopped reporting.
 */
export function boilerStatus(now: Date = new Date()): BoilerStatus {
  return {
    furnace: {
      working: true,
      lastMessageReply: { message: 'Furnace status updated', timestamp: houseTime(now, 20) },
    },
    pumps: {
      hot_water: {
        working: false,
        lastMessageReply: { message: 'Pump status updated', timestamp: houseTime(now, 21) },
      },
      heating: {
        working: true,
        lastMessageReply: {
          message: 'Pump state changed to: true',
          timestamp: houseTime(now, 185),
        },
      },
    },
  };
}

/** What the service answers before it has looked at the devices for the first time. */
export const BOILER_STATUS_BEFORE_FIRST_LOOK: BoilerStatus = {
  furnace: { working: false },
  pumps: { hot_water: { working: false }, heating: { working: false } },
};
