import { HttpRequest } from '@angular/common/http';

import { BOILER_STATUS_BEFORE_FIRST_LOOK, boilerStatus } from './boiler.fixtures';
import {
  heatingActivity,
  heatingStatus,
  temperatureSensors,
  turnHeating,
} from './heating.fixtures';
import { HOUSEHOLD_PROFILES } from './household.fixtures';
import { WATER_HEATING_DEMAND, WATER_TEMPERATURES } from './water.fixtures';

export interface MockReply {
  readonly status: number;
  readonly body: unknown;
}

export interface MockHandler {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Full path as the browser sends it, base path included. */
  readonly path: string;
  /** `fresh` is true in the scenario of services that have just started and know nothing yet. */
  reply(request: HttpRequest<unknown>, fresh: boolean): MockReply;
}

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
    path: '/home/household/profiles',
    reply: () => ({ status: 200, body: HOUSEHOLD_PROFILES }),
  },
  {
    method: 'GET',
    path: '/home/water/status/temperature',
    // before its first reading water-service answers 200 with no body at all
    reply: (_, fresh) => ({ status: 200, body: fresh ? null : WATER_TEMPERATURES }),
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
];
