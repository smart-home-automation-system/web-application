import { membersReport } from './chores.fixtures';
import {
  AIRCON_AUTOMATION_FRESH,
  airconAutomation,
  airconFilterCleaned,
  airconPower,
  airconPowerCycle,
  airconPowerSamples,
  airconRoom,
  airconRules,
  airconRuns,
  airconUnits,
  commandAircon,
  deleteAirconRule,
  saveAirconRule,
  startAirconPowerCycle,
} from './aircon.fixtures';
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
import { addRequest, markRequestDone, memberRequests, removeRequest } from './requests.fixtures';
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
  createHeatingSchedule,
  enableHeatingSchedule,
  floorPump,
  heatingActivity,
  heatingRooms,
  heatingStatus,
  removeHeatingSchedule,
  replaceHeatingSchedule,
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
  roomOccupancy,
  roomRule,
  setBrightness,
  setColor,
  setResidentEnabled,
  turnLight,
  turnRoom,
} from './lights.fixtures';
import {
  energyHistory,
  isHistoryRefusal,
  roomHistory,
  waterHistory,
  weatherHistory,
} from './history.fixtures';
import {
  battery,
  energyAlerts,
  energyDays,
  energyElicznik,
  energyFlows,
  energyForecast,
  energyMonths,
  energyStatus,
  gridOutages,
  gridReading,
  inverters,
} from './energy.fixtures';
import {
  automation,
  cancelCharge,
  chargeRuns,
  chargeState,
  plannedOutages,
  saveAutomation,
  skipOutage,
  startCharge,
} from './charge.fixtures';
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
import {
  WATER_HEATING_DEMAND,
  commandWaterValve,
  createWaterBill,
  deleteWaterBill,
  replaceWaterBill,
  startWaterCirculation,
  waterBills,
  waterCirculation,
  waterCirculationRuns,
  waterConsumption,
  waterTemperatures,
  waterValve,
} from './water.fixtures';
import {
  closeSoftenerLive,
  commandSoftener,
  openSoftenerLive,
  softener,
  softenerAlerts,
  softenerDays,
  softenerHistory,
  softenerRegenerations,
} from './softener.fixtures';
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
  // the writes of the periods of a heater (HAS-357): what the next read of the rooms answers
  {
    method: 'POST',
    path: /^\/home\/heating\/rooms\/([^/]+)\/heaters\/([^/]+)\/schedules$/,
    reply: (request, _fresh, [room, heater]) =>
      createHeatingSchedule(decodeURIComponent(room), decodeURIComponent(heater), request.body),
  },
  {
    method: 'PUT',
    path: /^\/home\/heating\/schedules\/(\d+)$/,
    reply: (request, _fresh, [id]) => replaceHeatingSchedule(id, request.body),
  },
  {
    method: 'PUT',
    path: /^\/home\/heating\/schedules\/(\d+)\/enabled$/,
    reply: (request, _fresh, [id]) => enableHeatingSchedule(id, request.params.get('value')),
  },
  {
    method: 'DELETE',
    path: /^\/home\/heating\/schedules\/(\d+)$/,
    reply: (_request, _fresh, [id]) => removeHeatingSchedule(id),
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
  // HAS-411: the household requests of a member (database-service 0.22.0)
  {
    method: 'GET',
    path: /^\/home\/household\/member\/([^/]+)\/requests$/,
    reply: (request, fresh, [name]) =>
      memberRequests(decodeURIComponent(name), request.params.get('done') === 'true', fresh),
  },
  {
    method: 'POST',
    path: /^\/home\/household\/member\/([^/]+)\/requests$/,
    reply: (request, _fresh, [name]) => addRequest(decodeURIComponent(name), request.body),
  },
  {
    method: 'PUT',
    path: /^\/home\/household\/member\/([^/]+)\/requests\/([^/]+)\/done$/,
    reply: (request, _fresh, [name, id]) =>
      markRequestDone(decodeURIComponent(name), id, request.params.get('member')),
  },
  {
    method: 'DELETE',
    path: /^\/home\/household\/member\/([^/]+)\/requests\/([^/]+)$/,
    reply: (_request, _fresh, [name, id]) => removeRequest(decodeURIComponent(name), id),
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
  // HAS-369: the sensors card of My room - what the sensors of one room sense
  {
    method: 'GET',
    path: /^\/home\/light\/rooms\/([^/]+)\/occupancy$/,
    reply: (_request, fresh, [room]) => roomOccupancy(decodeURIComponent(room), fresh),
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
  // HAS-394: the air conditioners of aircon-service - every unit, a room of My room, a command, the automation
  {
    method: 'GET',
    path: '/home/aircon',
    reply: (_request, fresh) => ({ status: 200, body: airconUnits(fresh) }),
  },
  {
    method: 'GET',
    path: '/home/aircon/automation',
    reply: (_request, fresh) => ({
      status: 200,
      body: fresh ? AIRCON_AUTOMATION_FRESH : airconAutomation(),
    }),
  },
  {
    method: 'GET',
    path: /^\/home\/aircon\/rooms\/([^/]+)$/,
    reply: (_request, fresh, [room]) => airconRoom(decodeURIComponent(room), fresh),
  },
  {
    method: 'POST',
    path: /^\/home\/aircon\/(\d+)$/,
    reply: (request, _fresh, [id]) => commandAircon(id, request.body, request.params.get('source')),
  },
  // HAS-395: the page of the units - the rules, the plugs, the power cycle, the filters, the runs
  {
    method: 'GET',
    path: '/home/aircon/rules',
    reply: (_request, fresh) => ({ status: 200, body: airconRules(fresh) }),
  },
  {
    method: 'PUT',
    path: /^\/home\/aircon\/(\d+)\/rules$/,
    reply: (request, _fresh, [id]) => saveAirconRule(id, request.body),
  },
  {
    method: 'DELETE',
    path: /^\/home\/aircon\/(\d+)\/rules$/,
    reply: (_request, _fresh, [id]) => deleteAirconRule(id),
  },
  {
    method: 'GET',
    path: '/home/aircon/power',
    reply: (_request, fresh) => ({ status: 200, body: airconPower(fresh) }),
  },
  {
    method: 'GET',
    path: '/home/aircon/power/samples',
    reply: (request, fresh) =>
      fresh
        ? { status: 200, body: [] }
        : airconPowerSamples(request.params.get('plug'), from(request), to(request)),
  },
  {
    method: 'GET',
    path: '/home/aircon/power-cycle',
    reply: (_request, fresh) => ({
      status: 200,
      body: fresh
        ? { allowed: false, reason: 'The draw of the indoor plug is not known' }
        : airconPowerCycle(),
    }),
  },
  {
    method: 'POST',
    path: '/home/aircon/power-cycle',
    reply: (request) => startAirconPowerCycle(request.params.get('member')),
  },
  {
    method: 'POST',
    path: /^\/home\/aircon\/(\d+)\/filter-cleaned$/,
    reply: (_request, _fresh, [id]) => airconFilterCleaned(id),
  },
  {
    method: 'GET',
    path: /^\/home\/aircon\/(\d+)\/runs$/,
    reply: (request, fresh, [id]) =>
      fresh ? { status: 200, body: [] } : airconRuns(id, from(request)),
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
    // HAS-316: just after a start the service has heard nothing of the valve - an empty object, never zeros
    method: 'GET',
    path: '/home/water/valve',
    reply: (_, fresh) => ({ status: 200, body: fresh ? {} : waterValve() }),
  },
  {
    // HAS-321: the command of the valve
    method: 'POST',
    path: '/home/water/valve',
    reply: (request) =>
      commandWaterValve(request.params.get('state'), request.params.get('source')),
  },
  // HAS-406: the circulation pump; just after a start the service has read nothing and started no run
  {
    method: 'GET',
    path: '/home/water/circulation',
    reply: (_, fresh) => ({ status: 200, body: fresh ? {} : waterCirculation() }),
  },
  {
    method: 'POST',
    path: '/home/water/circulation',
    reply: (request) => startWaterCirculation(request.params.get('source')),
  },
  {
    method: 'GET',
    path: '/home/water/circulation/runs',
    reply: (request, fresh) => ({
      status: 200,
      body: fresh ? [] : waterCirculationRuns(request.params.get('from'), request.params.get('to')),
    }),
  },
  // HAS-318: the bills of the waterworks; before its first reading the service has none
  {
    method: 'GET',
    path: '/home/water/bills',
    reply: (_, fresh) => ({ status: 200, body: fresh ? [] : waterBills() }),
  },
  { method: 'POST', path: '/home/water/bills', reply: (request) => createWaterBill(request.body) },
  {
    method: 'PUT',
    path: /^\/home\/water\/bills\/(\d+)$/,
    reply: (request, _, [id]) => replaceWaterBill(id, request.body),
  },
  {
    method: 'DELETE',
    path: /^\/home\/water\/bills\/(\d+)$/,
    reply: (_, __, [id]) => deleteWaterBill(id),
  },
  {
    method: 'GET',
    path: '/home/water/consumption',
    reply: (request, fresh) =>
      history(waterConsumption(request.params.get('range'), request.params.get('at'), fresh)),
  },
  {
    method: 'GET',
    path: '/home/water/status/active',
    reply: () => ({ status: 200, body: WATER_HEATING_DEMAND }),
  },
  // HAS-402: the water softener; just after a start the service has not read the cloud yet - 503, an empty history
  {
    method: 'GET',
    path: '/home/water/softener',
    reply: (_, fresh) =>
      fresh
        ? {
            status: 503,
            body: {
              errors: [
                {
                  code: 'SOFTENER_UNAVAILABLE',
                  message: 'Water softener unavailable',
                  details: 'The water softener has not been read from the iQua cloud yet',
                },
              ],
            },
          }
        : { status: 200, body: softener() },
  },
  {
    method: 'GET',
    path: '/home/water/softener/history',
    reply: (request, fresh) =>
      history(
        fresh
          ? { metric: 'saltLevel', points: [] }
          : softenerHistory(request.params.get('from'), request.params.get('to')),
      ),
  },
  {
    method: 'GET',
    path: '/home/water/softener/regenerations',
    reply: (_, fresh) => ({ status: 200, body: fresh ? [] : softenerRegenerations() }),
  },
  {
    method: 'GET',
    path: '/home/water/softener/days',
    reply: (request, fresh) => ({
      status: 200,
      body: fresh ? [] : softenerDays(request.params.get('from'), request.params.get('to')),
    }),
  },
  {
    method: 'GET',
    path: '/home/water/softener/alerts',
    reply: (_, fresh) => ({ status: 200, body: fresh ? [] : softenerAlerts() }),
  },
  {
    method: 'POST',
    path: '/home/water/softener/regeneration',
    reply: (request) => commandSoftener(request.params.get('when'), false),
  },
  {
    method: 'DELETE',
    path: '/home/water/softener/regeneration',
    reply: () => commandSoftener(null, true),
  },
  { method: 'PUT', path: '/home/water/softener/live', reply: () => openSoftenerLive() },
  { method: 'DELETE', path: '/home/water/softener/live', reply: () => closeSoftenerLive() },
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
  // the energy of the house (HAS-341)
  {
    method: 'GET',
    path: '/home/energy/status',
    reply: (_, fresh) => ({ status: 200, body: energyStatus(fresh) }),
  },
  {
    method: 'GET',
    path: '/home/energy/flows',
    reply: (_, fresh) => ({ status: 200, body: energyFlows(fresh) }),
  },
  {
    method: 'GET',
    path: '/home/energy/grid',
    reply: (_, fresh) => ({ status: 200, body: gridReading(fresh) }),
  },
  {
    method: 'GET',
    path: '/home/energy/inverters',
    reply: (_, fresh) => ({ status: 200, body: inverters(fresh) }),
  },
  {
    method: 'GET',
    path: '/home/energy/battery',
    reply: (_, fresh) => ({ status: 200, body: battery(fresh) }),
  },
  {
    method: 'GET',
    path: '/home/energy/alerts',
    reply: (_, fresh) => ({ status: 200, body: energyAlerts(fresh) }),
  },
  {
    method: 'GET',
    path: '/home/energy/outages',
    reply: (_, fresh) => ({ status: 200, body: gridOutages(fresh) }),
  },
  // the charge of the battery and its automation (HAS-342)
  {
    method: 'GET',
    path: '/home/energy/battery/charge',
    reply: (_, fresh) => ({ status: 200, body: chargeState(fresh) }),
  },
  {
    method: 'POST',
    path: '/home/energy/battery/charge',
    reply: (request) => startCharge(request),
  },
  {
    method: 'DELETE',
    path: '/home/energy/battery/charge',
    reply: () => cancelCharge(),
  },
  {
    method: 'GET',
    path: '/home/energy/battery/charge/runs',
    reply: (_, fresh) => ({ status: 200, body: chargeRuns(fresh) }),
  },
  {
    method: 'GET',
    path: '/home/energy/automation',
    reply: (_, fresh) => ({ status: 200, body: automation(fresh) }),
  },
  {
    method: 'PUT',
    path: '/home/energy/automation',
    reply: (request) => saveAutomation(request),
  },
  {
    method: 'GET',
    path: '/home/energy/outages/planned',
    reply: (_, fresh) => ({ status: 200, body: plannedOutages(fresh) }),
  },
  {
    method: 'PUT',
    path: /^\/home\/energy\/outages\/planned\/(\d+)\/(skip|unskip)$/,
    reply: (_, __, [id, action]) => skipOutage(Number(id), action === 'skip'),
  },
  {
    method: 'GET',
    path: '/home/energy/history',
    reply: (request, fresh) =>
      history(energyHistory(request.params.get('metric'), from(request), to(request), fresh)),
  },
  {
    method: 'GET',
    path: '/home/energy/forecast',
    reply: (_, fresh) => ({ status: 200, body: energyForecast(fresh) }),
  },
  {
    method: 'GET',
    path: '/home/energy/days',
    reply: (request, fresh) => energyDays(from(request), to(request), fresh),
  },
  {
    method: 'GET',
    path: '/home/energy/elicznik',
    reply: (request, fresh) => energyElicznik(from(request), to(request), fresh),
  },
  {
    method: 'GET',
    path: '/home/energy/months',
    reply: (request, fresh) => energyMonths(request.params.get('year'), fresh),
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
