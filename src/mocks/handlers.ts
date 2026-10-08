import { HttpRequest } from '@angular/common/http';

import { HEATING_STATUS } from './heating.fixtures';
import { HOUSEHOLD_PROFILES } from './household.fixtures';

export interface MockReply {
  readonly status: number;
  readonly body: unknown;
}

export interface MockHandler {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Full path as the browser sends it, base path included. */
  readonly path: string;
  reply(request: HttpRequest<unknown>): MockReply;
}

/**
 * One entry per backend endpoint the application calls. Fixtures mirror real answers of the
 * gateway in shape - and use invented names and values only: this repository is public.
 */
export const MOCK_HANDLERS: readonly MockHandler[] = [
  { method: 'GET', path: '/home/heating', reply: () => ({ status: 200, body: HEATING_STATUS }) },
  {
    method: 'GET',
    path: '/home/household/profiles',
    reply: () => ({ status: 200, body: HOUSEHOLD_PROFILES }),
  },
];
