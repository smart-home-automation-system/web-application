import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiClient } from './api-client';
import { ApiError } from './api-error';
import { ConnectionStore } from './connection-store';

describe('ApiClient', () => {
  let api: ApiClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ApiClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('prefixes the gateway base path', () => {
    api.get('/heating').subscribe();

    const request = http.expectOne('/home/heating');
    expect(request.request.method).toBe('GET');
    request.flush({});
  });

  it('accepts a path without a leading slash', () => {
    api.get('water/status/active').subscribe();

    const request = http.expectOne('/home/water/status/active');
    expect(request.request.url).toBe('/home/water/status/active');
    request.flush({});
  });

  it('sends query parameters', () => {
    api.post('/heating', undefined, { turn: 'on' }).subscribe();

    const request = http.expectOne('/home/heating?turn=on');
    expect(request.request.method).toBe('POST');
    request.flush({});
  });

  it('returns the body of a successful call', () => {
    let received: unknown;

    api.get<{ active: boolean }>('/heating/status/active').subscribe((body) => (received = body));
    http.expectOne('/home/heating/status/active').flush({ active: true });

    expect(received).toEqual({ active: true });
  });

  it('turns a failed call into an ApiError', () => {
    let failure: unknown;

    api.get('/heating').subscribe({ error: (error: unknown) => (failure = error) });
    http
      .expectOne('/home/heating')
      .flush({ errors: [{ message: 'Down' }] }, { status: 502, statusText: 'Bad Gateway' });

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).kind).toBe('server');
    expect((failure as ApiError).status).toBe(502);
  });

  it('gives up on a call that gets no answer in time, and aborts it', () => {
    vi.useFakeTimers();
    try {
      let failure: unknown;
      api.get('/heating').subscribe({ error: (error: unknown) => (failure = error) });
      const request = http.expectOne('/home/heating');

      vi.advanceTimersByTime(9_999);
      expect(failure).toBeUndefined();

      vi.advanceTimersByTime(1);
      expect(failure).toBeInstanceOf(ApiError);
      expect((failure as ApiError).kind).toBe('network');
      expect(request.cancelled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  // the service worker stores the application, never an answer of the backend - and would turn
  // a call that got no answer into a 504 of its own making
  it.each(['get', 'post', 'patch', 'delete'] as const)(
    'sends every %s past the service worker',
    (method) => {
      api[method]('/heating', {}).subscribe();

      const request = http.expectOne('/home/heating');
      expect(request.request.headers.get('ngsw-bypass')).toBe('true');
      request.flush({});
    },
  );

  describe('tells whether the house can be reached', () => {
    let connection: ConnectionStore;

    beforeEach(() => {
      localStorage.removeItem('smart-home.last-contact');
      connection = TestBed.inject(ConnectionStore);
    });

    afterEach(() => localStorage.removeItem('smart-home.last-contact'));

    function fail(how: (request: ReturnType<HttpTestingController['expectOne']>) => void): void {
      api.get('/heating').subscribe({ error: () => undefined });
      how(http.expectOne('/home/heating'));
    }

    it('in doubt after one call that got no answer, out of reach after the second', () => {
      fail((request) => request.error(new ProgressEvent('error')));
      expect(connection.doubted()).toBe(true);
      expect(connection.offline()).toBe(false);

      fail((request) => request.error(new ProgressEvent('error')));
      expect(connection.offline()).toBe(true);
    });

    // one service that never answers, next to one that does: the house is there
    it('within reach when another call was answered while this one waited in vain', () => {
      vi.useFakeTimers();
      try {
        api.get('/water').subscribe({ error: () => undefined });
        api.get('/boiler').subscribe({ error: () => undefined });
        http.expectOne('/home/water');
        http.expectOne('/home/boiler');
        vi.advanceTimersByTime(5_000);
        api.get('/heating').subscribe();
        http.expectOne('/home/heating').flush({});

        vi.advanceTimersByTime(5_000);

        expect(connection.doubted()).toBe(false);
        expect(connection.offline()).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('out of reach after two calls that got no answer in time', () => {
      vi.useFakeTimers();
      try {
        api.get('/heating').subscribe({ error: () => undefined });
        api.get('/water').subscribe({ error: () => undefined });
        http.expectOne('/home/heating');
        http.expectOne('/home/water');

        vi.advanceTimersByTime(10_000);

        expect(connection.offline()).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('within reach again, with the time of it, after a call that succeeded', () => {
      fail((request) => request.error(new ProgressEvent('error')));
      fail((request) => request.error(new ProgressEvent('error')));
      const before = Date.now();

      api.get('/heating').subscribe();
      http.expectOne('/home/heating').flush({});

      expect(connection.offline()).toBe(false);
      expect(connection.lastContact()).toBeGreaterThanOrEqual(before);
    });

    it('within reach after a failing service answered - but that is no contact to date', () => {
      fail((request) => request.error(new ProgressEvent('error')));
      fail((request) => request.error(new ProgressEvent('error')));

      fail((request) => request.flush({}, { status: 502, statusText: 'Bad Gateway' }));

      expect(connection.offline()).toBe(false);
      expect(connection.lastContact()).toBeUndefined();
    });
  });

  it('turns a lost connection into a network ApiError', () => {
    let failure: unknown;

    api.delete('/household/member/x').subscribe({ error: (error: unknown) => (failure = error) });
    http.expectOne('/home/household/member/x').error(new ProgressEvent('error'));

    expect((failure as ApiError).kind).toBe('network');
  });
});
