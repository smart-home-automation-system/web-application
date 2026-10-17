import { HttpRequest } from '@angular/common/http';

import {
  blindSchedules,
  blindsByRoom,
  moveBlind,
  moveBlindTo,
  pauseBlind,
  switchLight,
} from './blinds.fixtures';
import { BOILER_STATUS_BEFORE_FIRST_LOOK, boilerStatus } from './boiler.fixtures';
import {
  addDevice as addRegisteredDevice,
  deviceRegistry,
  removeDevice as removeRegisteredDevice,
  replaceDevice,
  setDeviceEnabled,
} from './devices.fixtures';
import {
  floorPump,
  heatingActivity,
  heatingRooms,
  heatingStatus,
  temperatureSensors,
  turnHeating,
} from './heating.fixtures';
import { isHistoryRefusal, roomHistory, waterHistory, weatherHistory } from './history.fixtures';
import {
  addDevice,
  addMember,
  householdProfiles,
  householdRegistry,
  removeDevice,
  removeMember,
  replacePermissions,
  replaceRooms,
  setMemberActive,
  updateDevice,
  updateMember,
} from './household.fixtures';
import {
  dailyPresenceReport,
  houseReport,
  isRefusal,
  presenceNow,
  presenceReport,
} from './presence.fixtures';
import { WATER_HEATING_DEMAND, waterTemperatures } from './water.fixtures';
import {
  STATION_STATUS_BEFORE_FIRST_READING,
  currentWeather,
  stationStatus,
} from './weather.fixtures';

export interface MockReply {
  readonly status: number;
  readonly body: unknown;
}

export interface MockHandler {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /**
   * Full path as the browser sends it, base path included - or a pattern, for a path with a
   * name in it; what its groups caught is handed to `reply`.
   */
  readonly path: string | RegExp;
  /** `fresh` is true in the scenario of services that have just started and know nothing yet. */
  reply(request: HttpRequest<unknown>, fresh: boolean, caught: readonly string[]): MockReply;
}

/** A report of presence-service, or the refusal it answers instead - in the error contract. */
function report(answer: object): MockReply {
  return isRefusal(answer)
    ? { status: answer.status, body: { errors: [{ message: answer.message }] } }
    : { status: 200, body: answer };
}

/** A history, or the refusal of its range - a 400 with the reason, and the code if it has one. */
function history(answer: object): MockReply {
  if (!isHistoryRefusal(answer)) {
    return { status: 200, body: answer };
  }
  const code = 'code' in answer ? { code: answer.code } : {};
  return { status: answer.status, body: { errors: [{ message: answer.message, ...code }] } };
}

const from = (request: HttpRequest<unknown>) => request.params.get('from');
const to = (request: HttpRequest<unknown>) => request.params.get('to');

/**
 * One entry per backend endpoint the application calls. Fixtures mirror real answers of the
 * gateway in shape - and use invented names and values only: this repository is public.
 */
export const MOCK_HANDLERS: readonly MockHandler[] = [
  { method: 'GET', path: '/home/heating', reply: () => ({ status: 200, body: heatingStatus() }) },
  {
    // the switch of the mock house: the next read of the status answers with what was set here
    method: 'POST',
    path: '/home/heating',
    reply: (request) => ({ status: 200, body: turnHeating(request.params.get('turn')) }),
  },
  {
    method: 'GET',
    path: '/home/heating/status/active',
    reply: () => ({ status: 200, body: heatingActivity() }),
  },
  {
    method: 'GET',
    path: '/home/heating/temperature/sensors',
    // a room that never reported is not in the answer: just after the first start there is none
    reply: (_, fresh) => ({ status: 200, body: fresh ? [] : temperatureSensors() }),
  },
  {
    method: 'GET',
    path: '/home/heating/rooms',
    // just after a start the service knows its rooms and their schedules, and nothing measured
    reply: (_, fresh) => ({ status: 200, body: heatingRooms(new Date(), fresh) }),
  },
  {
    // one room by its name, in any case, as the service finds it - and its 404 with the code a
    // client tells "no such room" by
    method: 'GET',
    path: /^\/home\/heating\/rooms\/([^/]+)$/,
    reply: (_, fresh, [name]) => {
      const asked = decodeURIComponent(name);
      const room = heatingRooms(new Date(), fresh).find(
        (one) => one.name?.toLowerCase() === asked.toLowerCase(),
      );
      return room
        ? { status: 200, body: room }
        : {
            status: 404,
            body: {
              errors: [
                {
                  code: 'NOT_FOUND_ROOM',
                  details: `Room name: ${asked}`,
                  message: 'Room with provided name is not a part of home',
                },
              ],
            },
          };
    },
  },
  {
    // the stored temperatures of a room; an unknown room is the same 404 as for the room itself
    method: 'GET',
    path: /^\/home\/heating\/rooms\/([^/]+)\/temperature\/history$/,
    reply: (request, fresh, [name]) => {
      const asked = decodeURIComponent(name);
      const room = heatingRooms(new Date(), fresh).find(
        (one) => one.name?.toLowerCase() === asked.toLowerCase(),
      );
      return room?.name
        ? history(roomHistory(room.name, from(request), to(request), fresh))
        : {
            status: 404,
            body: {
              errors: [
                {
                  code: 'NOT_FOUND_ROOM',
                  details: `Room name: ${asked}`,
                  message: 'Room with provided name is not a part of home',
                },
              ],
            },
          };
    },
  },
  {
    method: 'GET',
    path: '/home/heating/floor-pump',
    // until the relay of the pump has answered the service says nothing about it
    reply: (_, fresh) => ({ status: 200, body: fresh ? {} : floorPump() }),
  },
  {
    method: 'GET',
    path: '/home/household/profiles',
    reply: () => ({ status: 200, body: householdProfiles() }),
  },
  {
    // the registry itself, phones and devices included: asked for by the administration page only
    method: 'GET',
    path: '/home/household',
    reply: () => ({ status: 200, body: householdRegistry() }),
  },
  { method: 'POST', path: '/home/household/member', reply: (request) => addMember(request.body) },
  {
    method: 'PATCH',
    path: /^\/home\/household\/member\/([^/]+)$/,
    reply: (request, _, [name]) => updateMember(decodeURIComponent(name), request.body),
  },
  {
    method: 'DELETE',
    path: /^\/home\/household\/member\/([^/]+)$/,
    reply: (_, __, [name]) => removeMember(decodeURIComponent(name)),
  },
  {
    method: 'PUT',
    path: /^\/home\/household\/member\/([^/]+)\/rooms$/,
    reply: (request, _, [name]) => replaceRooms(decodeURIComponent(name), request.body),
  },
  {
    method: 'PUT',
    path: /^\/home\/household\/member\/([^/]+)\/permissions$/,
    reply: (request, _, [name]) => replacePermissions(decodeURIComponent(name), request.body),
  },
  {
    method: 'POST',
    path: /^\/home\/household\/member\/([^/]+)\/(activate|deactivate)$/,
    reply: (_, __, [name, what]) => setMemberActive(decodeURIComponent(name), what === 'activate'),
  },
  {
    method: 'POST',
    path: /^\/home\/household\/member\/([^/]+)\/device$/,
    reply: (request, _, [name]) => addDevice(decodeURIComponent(name), request.body),
  },
  {
    method: 'PATCH',
    path: /^\/home\/household\/member\/([^/]+)\/device$/,
    reply: (request, _, [name]) =>
      updateDevice(decodeURIComponent(name), request.params.get('mac'), request.body),
  },
  {
    method: 'DELETE',
    path: /^\/home\/household\/member\/([^/]+)\/device$/,
    reply: (request, _, [name]) =>
      removeDevice(decodeURIComponent(name), request.params.get('mac')),
  },
  // the blinds (HAS-232): their state, the commands, the pause and the schedules of one
  { method: 'GET', path: '/home/blinds', reply: () => ({ status: 200, body: blindsByRoom() }) },
  {
    method: 'POST',
    path: /^\/home\/blinds\/(\d+)$/,
    reply: (request, _fresh, [id]) => moveBlind(id, request.params.get('command')),
  },
  {
    method: 'POST',
    path: /^\/home\/blinds\/(\d+)\/position$/,
    reply: (request, _fresh, [id]) => moveBlindTo(id, request.params.get('value')),
  },
  {
    method: 'PUT',
    path: /^\/home\/blinds\/(\d+)\/schedule-pause$/,
    reply: (_request, _fresh, [id]) => pauseBlind(id, true),
  },
  {
    method: 'DELETE',
    path: /^\/home\/blinds\/(\d+)\/schedule-pause$/,
    reply: (_request, _fresh, [id]) => pauseBlind(id, false),
  },
  {
    method: 'GET',
    path: /^\/home\/blinds\/(\d+)\/schedules$/,
    reply: (_request, _fresh, [id]) => blindSchedules(id),
  },
  // the Eaton lights through amx-service: the frame goes out, nothing is kept
  {
    method: 'POST',
    path: /^\/home\/amx\/lights\/(\d+)$/,
    reply: (request, _fresh, [point]) => switchLight(point, request.params.get('turn')),
  },
  {
    method: 'POST',
    path: /^\/home\/amx\/lights\/(\d+)\/level$/,
    reply: (_request, _fresh, [point]) => ({
      status: 202,
      body: { point: Number(point), status: 'OK' },
    }),
  },
  {
    // every device of the house: asked for by the administration page of the devices
    method: 'GET',
    path: '/home/device/registry',
    reply: () => ({ status: 200, body: deviceRegistry() }),
  },
  {
    method: 'POST',
    path: '/home/device/registry',
    reply: (request) => addRegisteredDevice(request.body),
  },
  {
    method: 'PUT',
    path: /^\/home\/device\/registry\/([^/]+)$/,
    reply: (request, _, [id]) => replaceDevice(id, request.body),
  },
  {
    method: 'POST',
    path: /^\/home\/device\/registry\/([^/]+)\/(enable|disable)$/,
    reply: (_, __, [id, what]) => setDeviceEnabled(id, what === 'enable'),
  },
  {
    method: 'DELETE',
    path: /^\/home\/device\/registry\/([^/]+)$/,
    reply: (_, __, [id]) => removeRegisteredDevice(id),
  },
  {
    method: 'GET',
    path: '/home/presence/residents/presence',
    reply: (_, fresh) => ({ status: 200, body: presenceNow(fresh) }),
  },
  {
    method: 'GET',
    path: /^\/home\/presence\/residents\/([^/]+)\/report$/,
    reply: (request, fresh, [name]) =>
      report(presenceReport(decodeURIComponent(name), from(request), to(request), fresh)),
  },
  {
    method: 'GET',
    path: /^\/home\/presence\/residents\/([^/]+)\/report\/daily$/,
    reply: (request, fresh, [name]) =>
      report(dailyPresenceReport(decodeURIComponent(name), from(request), to(request), fresh)),
  },
  {
    method: 'GET',
    path: '/home/presence/house/report',
    reply: (request, fresh) => report(houseReport(from(request), to(request), fresh)),
  },
  {
    method: 'GET',
    path: '/home/water/status/temperature',
    // before its first reading water-service answers 200 with no body at all
    reply: (_, fresh) => ({ status: 200, body: fresh ? null : waterTemperatures() }),
  },
  {
    method: 'GET',
    path: '/home/water/temperature/history',
    reply: (request, fresh) => history(waterHistory(from(request), to(request), fresh)),
  },
  {
    method: 'GET',
    path: '/home/water/status/active',
    reply: () => ({ status: 200, body: WATER_HEATING_DEMAND }),
  },
  {
    method: 'GET',
    path: '/home/boiler/status',
    reply: (_, fresh) => ({
      status: 200,
      body: fresh ? BOILER_STATUS_BEFORE_FIRST_LOOK : boilerStatus(),
    }),
  },
  {
    // just after a start the service has heard of no metric: an empty object, never zeros
    method: 'GET',
    path: '/home/weather/current',
    reply: (_, fresh) => ({ status: 200, body: fresh ? {} : currentWeather() }),
  },
  {
    method: 'GET',
    path: '/home/weather/history',
    reply: (request, fresh) =>
      history(weatherHistory(request.params.get('metric'), from(request), to(request), fresh)),
  },
  {
    method: 'GET',
    path: '/home/weather/status',
    reply: (_, fresh) => ({
      status: 200,
      body: fresh ? STATION_STATUS_BEFORE_FIRST_READING : stationStatus(),
    }),
  },
];
