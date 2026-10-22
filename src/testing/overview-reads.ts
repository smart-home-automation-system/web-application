import { HttpRequest } from '@angular/common/http';

/**
 * What the shell reads on every page, for everybody: the weather of its strip. A test that
 * renders pages through the real routes lets it through with `isShellRead`.
 */
export const SHELL_READS: readonly string[] = ['/home/weather/current'];

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
];

export function isShellRead(request: HttpRequest<unknown>): boolean {
  return request.method === 'GET' && SHELL_READS.includes(request.url);
}

export function isOverviewRead(request: HttpRequest<unknown>): boolean {
  return request.method === 'GET' && OVERVIEW_READS.includes(request.url);
}
