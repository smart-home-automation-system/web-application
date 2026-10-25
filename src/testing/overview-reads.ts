import { HttpRequest } from '@angular/common/http';

/**
 * What the shell reads on every page: the weather of its strip, for everybody, and the appliances
 * of its notice, for a member with a profile. A test that
 * renders pages through the real routes lets it through with `isShellRead`.
 */
export const SHELL_READS: readonly string[] = [
  '/home/weather/current',
  // HAS-282: the appliances of the notice, for a member with a profile
  '/home/appliance',
];

/**
 * What the overview reads when it is opened: one call per tile, `GET` only. A test that renders
 * pages through the real routes passes by the overview of the administrator, and lets exactly
 * these through - a call that is not in the list still fails the test.
 */
export const OVERVIEW_READS: readonly string[] = [
  '/home/heating',
  '/home/heating/rooms',
  '/home/heating/temperature/sensors',
  '/home/water/status/temperature',
  '/home/boiler/status',
  '/home/presence/residents/presence',
  '/home/weather/current',
  '/home/blinds',
  // HAS-268: the lights tile, two calls
  '/home/light',
  '/home/light/empty-house',
  // HAS-282: the appliance tile - the resource of the notice of the shell
  '/home/appliance',
];

export function isShellRead(request: HttpRequest<unknown>): boolean {
  return request.method === 'GET' && SHELL_READS.includes(request.url);
}

export function isOverviewRead(request: HttpRequest<unknown>): boolean {
  return request.method === 'GET' && OVERVIEW_READS.includes(request.url);
}
