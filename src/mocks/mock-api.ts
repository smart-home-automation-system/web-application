import {
  HttpErrorResponse,
  HttpEvent,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable, delay, of, switchMap, throwError, timer } from 'rxjs';

import { MOCK_HANDLERS, MockReply } from './handlers';

/**
 * Mock API: answers every `/home/**` call from fixtures, without a backend. It replaces
 * `src/app/core/api/mock-api.ts` in the `mock` build configuration only (`npm run start:mock`).
 *
 * A scenario switches the whole API into a failure mode, so error states can be looked at and
 * tested: set `localStorage['mock-scenario']` to `offline` (no answer at all) or `server-error`
 * (every call answers 502) and reload. A third one, `no-readings`, is not a failure: the
 * services answer as they do just after a start, before they measured or looked at anything.
 * A fourth, `writes-fail`, answers every read as usual and every call that would change
 * something with a 500 - the way to look at a switch that the house did not carry out.
 */
export type MockScenario = 'default' | 'offline' | 'server-error' | 'no-readings' | 'writes-fail';

// check-bundle.mjs looks for this text: it must never show up in a production bundle
const MARKER = 'smart-home-mock-api-enabled';
const LATENCY_MS = 150;
const API_PREFIX = '/home/';

console.info(`[${MARKER}] backend calls are answered from src/mocks, scenario: ${scenario()}`);

const mockApiInterceptor: HttpInterceptorFn = (request, next) => {
  const path = new URL(request.url, 'https://mock.invalid').pathname;
  if (!path.startsWith(API_PREFIX)) {
    return next(request);
  }
  switch (scenario()) {
    case 'offline':
      return fail(request, 0, new ProgressEvent('error'));
    case 'server-error':
      return fail(request, 502, {
        errors: [{ message: 'Mock scenario: the service behind the gateway is failing' }],
      });
    case 'no-readings':
      return answer(request, path, true);
    case 'writes-fail':
      return request.method === 'GET'
        ? answer(request, path, false)
        : fail(request, 500, {
            errors: [{ message: 'Mock scenario: the change was not carried out' }],
          });
    default:
      return answer(request, path, false);
  }
};

export const mockApiInterceptors: readonly HttpInterceptorFn[] = [mockApiInterceptor];

function answer(
  request: HttpRequest<unknown>,
  path: string,
  fresh: boolean,
): Observable<HttpEvent<unknown>> {
  const matched = MOCK_HANDLERS.flatMap((handler) => {
    if (handler.method !== request.method) {
      return [];
    }
    if (typeof handler.path === 'string') {
      return handler.path === path ? [{ handler, caught: [] as string[] }] : [];
    }
    const match = handler.path.exec(path);
    return match ? [{ handler, caught: match.slice(1) }] : [];
  }).at(0);
  // the same answer the gateway gives for a path nobody serves
  const reply: MockReply = matched?.handler.reply(request, fresh, matched.caught) ?? {
    status: 404,
    body: { errors: [{ message: `No static resource for request '${path}'.` }] },
  };
  if (reply.status >= 400) {
    return fail(request, reply.status, reply.body);
  }
  return of(new HttpResponse({ status: reply.status, body: reply.body, url: request.url })).pipe(
    delay(LATENCY_MS),
  );
}

function fail(request: HttpRequest<unknown>, status: number, error: unknown): Observable<never> {
  return timer(LATENCY_MS).pipe(
    switchMap(() => throwError(() => new HttpErrorResponse({ status, error, url: request.url }))),
  );
}

function scenario(): MockScenario {
  try {
    const stored = localStorage.getItem('mock-scenario');
    return stored === 'offline' ||
      stored === 'server-error' ||
      stored === 'no-readings' ||
      stored === 'writes-fail'
      ? stored
      : 'default';
  } catch {
    return 'default';
  }
}
