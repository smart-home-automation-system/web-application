import { membersReport } from './chores.fixtures';
import { HttpRequest } from '@angular/common/http';

import {
  acknowledgeAppliance,
  applianceRuns,
  claimAppliance,
  applianceSamples,
  appliancesNow,
  oneAppliance,
} from './appliances.fixtures';
import { pushConfig, removePushSubscription, storePushSubscription } from './push.fixtures';
import { blindsByRoom, moveBlind, moveBlindTo, moveRoom, pauseBlind } from './blinds.fixtures';
import { calendarDays } from './calendar.fixtures';
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
import {
  emptyHouse,
  lightRules,
  lightRuns,
  lightsByRoom,
  removeRule,
  replaceRule,
  roomLights,
  roomRule,
  setBrightness,
  setColor,
  setResidentEnabled,
  turnLight,
  turnRoom,
} from './lights.fixtures';
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
import {
  allSchedules,
  createSchedule,
  enableSchedule,
  oneSchedule,
  removeSchedule,
  replaceSchedule,
  scheduleToday,
} from './schedules.fixtures';
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
  // HAS-284: the Web Push subscription of this browser - before the member handlers below, whose
  // patterns would take the path too
  {
    method: 'GET',
    path: '/home/household/push-config',
    reply: (_request, fresh) => pushConfig(fresh),
  },
  {
    method: 'PUT',
    path: /^\/home\/household\/member\/([^/]+)\/push-subscriptions$/,
    reply: (request, _fresh, [name]) =>
      storePushSubscription(decodeURIComponent(name), request.body),
  },
  {
    method: 'DELETE',
    path: /^\/home\/household\/member\/([^/]+)\/push-subscriptions$/,
    reply: (request, _fresh, [name]) =>
      removePushSubscription(decodeURIComponent(name), request.params.get('endpoint')),
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
  // the blinds (HAS-232): their state, the commands and the pause of their schedules
  { method: 'GET', path: '/home/blinds', reply: () => ({ status: 200, body: blindsByRoom() }) },
  // the blinds of one room, for "My room" (HAS-254): a room without blinds is a 404 with its code,
  // as blinds-service answers it
  {
    method: 'GET',
    path: /^\/home\/blinds\/rooms\/([^/]+)$/,
    reply: (_request, _fresh, [room]) => {
      const name = decodeURIComponent(room);
      const here = blindsByRoom().find((group) => group.room === name);
      return here
        ? { status: 200, body: here }
        : {
            status: 404,
            body: {
              errors: [{ message: 'Blinds not found', code: 'NOT_FOUND_BLINDS' }],
            },
          };
    },
  },
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
  // the blinds page (HAS-252): a room at once, the schedules and what they do today
  {
    method: 'POST',
    path: /^\/home\/blinds\/rooms\/([^/]+)$/,
    reply: (request, _fresh, [room]) =>
      moveRoom(decodeURIComponent(room), request.params.get('command')),
  },
  {
    method: 'GET',
    path: '/home/blinds/schedules',
    reply: () => ({ status: 200, body: allSchedules() }),
  },
  // the editor of a schedule (HAS-253)
  {
    method: 'POST',
    path: '/home/blinds/schedules',
    reply: (request) => createSchedule(request.body),
  },
  {
    method: 'GET',
    path: /^\/home\/blinds\/schedules\/(\d+)$/,
    reply: (_request, _fresh, [id]) => oneSchedule(id),
  },
  {
    method: 'PUT',
    path: /^\/home\/blinds\/schedules\/(\d+)$/,
    reply: (request, _fresh, [id]) => replaceSchedule(id, request.body),
  },
  {
    method: 'DELETE',
    path: /^\/home\/blinds\/schedules\/(\d+)$/,
    reply: (_request, _fresh, [id]) => removeSchedule(id),
  },
  {
    method: 'GET',
    path: /^\/home\/blinds\/schedules\/(\d+)\/today$/,
    reply: (_request, _fresh, [id]) => scheduleToday(id),
  },
  {
    method: 'POST',
    path: /^\/home\/blinds\/schedules\/(\d+)\/(enable|disable)$/,
    reply: (_request, _fresh, [id, change]) => enableSchedule(id, change === 'enable'),
  },
  // the calendar of the house: the holidays the schedules read
  {
    method: 'GET',
    path: '/home/calendar/days',
    reply: (request) => calendarDays(from(request), to(request)),
  },
  // the lights of light-service (HAS-292): their real state and the commands, by registry id
  {
    method: 'GET',
    path: '/home/light',
    reply: (_request, fresh) => ({ status: 200, body: lightsByRoom(fresh) }),
  },
  {
    method: 'POST',
    path: /^\/home\/light\/(\d+)$/,
    reply: (request, _fresh, [id]) =>
      turnLight(id, request.params.get('turn'), request.params.get('source')),
  },
  {
    method: 'POST',
    path: /^\/home\/light\/(\d+)\/brightness$/,
    reply: (request, _fresh, [id]) =>
      setBrightness(id, request.params.get('value'), request.params.get('source')),
  },
  // HAS-266: the colour of an rgbw light, a room at once, the rules, their runs and the empty house
  {
    method: 'POST',
    path: /^\/home\/light\/(\d+)\/color$/,
    reply: (request, _fresh, [id]) => setColor(id, request.body, request.params.get('source')),
  },
  {
    method: 'POST',
    path: /^\/home\/light\/rooms\/([^/]+)$/,
    reply: (request, _fresh, [room]) =>
      turnRoom(decodeURIComponent(room), request.params.get('turn'), request.params.get('source')),
  },
  // HAS-268: the lights card of My room - one room, its rule, and the switch of the resident
  {
    method: 'GET',
    path: /^\/home\/light\/rooms\/([^/]+)$/,
    reply: (_request, fresh, [room]) => roomLights(decodeURIComponent(room), fresh),
  },
  {
    method: 'GET',
    path: /^\/home\/light\/rooms\/([^/]+)\/rules$/,
    reply: (_request, fresh, [room]) => roomRule(decodeURIComponent(room), fresh),
  },
  {
    method: 'PUT',
    path: /^\/home\/light\/rooms\/([^/]+)\/rules\/resident-enabled$/,
    reply: (request, _fresh, [room]) => setResidentEnabled(decodeURIComponent(room), request.body),
  },
  // HAS-267: the editor of the rule of a room writes it whole, or removes it
  {
    method: 'PUT',
    path: /^\/home\/light\/rooms\/([^/]+)\/rules$/,
    reply: (request, _fresh, [room]) => replaceRule(decodeURIComponent(room), request.body),
  },
  {
    method: 'DELETE',
    path: /^\/home\/light\/rooms\/([^/]+)\/rules$/,
    reply: (_request, _fresh, [room]) => removeRule(decodeURIComponent(room)),
  },
  {
    method: 'GET',
    path: '/home/light/rules',
    reply: (_request, fresh) => ({ status: 200, body: lightRules(fresh) }),
  },
  {
    method: 'GET',
    path: /^\/home\/light\/rooms\/([^/]+)\/rules\/runs$/,
    reply: (_request, fresh, [room]) => ({
      status: 200,
      body: fresh ? [] : lightRuns(decodeURIComponent(room)),
    }),
  },
  {
    method: 'GET',
    path: '/home/light/empty-house',
    reply: (_request, fresh) => ({ status: 200, body: emptyHouse(fresh) }),
  },
  // HAS-282: the appliances of appliance-service, and the acknowledgement of a finished one
  {
    method: 'GET',
    path: '/home/appliance',
    reply: (_request, fresh) => ({ status: 200, body: appliancesNow(fresh) }),
  },
  {
    method: 'GET',
    path: /^\/home\/appliance\/(\d+)$/,
    reply: (_request, fresh, [id]) => oneAppliance(id, fresh),
  },
  {
    method: 'POST',
    path: /^\/home\/appliance\/(\d+)\/acknowledge$/,
    reply: (request, _fresh, [id]) => acknowledgeAppliance(id, request.params.get('member')),
  },
  // HAS-346: a chore claimed with the NFC tag of an appliance
  {
    method: 'POST',
    path: '/home/appliance/claims',
    reply: (request) => claimAppliance(request.body),
  },
  // HAS-346: the chores report per member (appliance-service HAS-345)
  {
    method: 'GET',
    path: '/home/appliance/reports/members',
    reply: (request, fresh) =>
      membersReport(request.params.get('from'), request.params.get('to'), fresh),
  },
  {
    method: 'GET',
    path: /^\/home\/appliance\/(\d+)\/runs$/,
    reply: (request, fresh, [id]) => ({
      status: 200,
      body: fresh ? [] : applianceRuns(id, request.params.get('from'), request.params.get('to')),
    }),
  },
  {
    method: 'GET',
    path: /^\/home\/appliance\/(\d+)\/samples$/,
    reply: (request, fresh, [id]) => ({
      status: 200,
      body: fresh ? [] : applianceSamples(id, request.params.get('from'), request.params.get('to')),
    }),
  },
  {
    // every device of the house: asked for by the administration page of the devices
    method: 'GET',
    path: '/home/device/registry',
    // filtered as database-service filters it: the sensors of a room on "My room" (HAS-254)
    reply: (request) => ({
      status: 200,
      body: deviceRegistry().filter(
        (device) =>
          (!request.params.has('room') || device.room === request.params.get('room')) &&
          (!request.params.has('kind') || device.kind === request.params.get('kind')) &&
          (!request.params.has('enabled') ||
            String(device.enabled !== false) === request.params.get('enabled')),
      ),
    }),
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
