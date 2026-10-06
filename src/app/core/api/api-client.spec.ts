import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ApiClient } from './api-client';
import { ApiError } from './api-error';

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

  it('turns a lost connection into a network ApiError', () => {
    let failure: unknown;

    api.delete('/household/member/x').subscribe({ error: (error: unknown) => (failure = error) });
    http.expectOne('/home/household/member/x').error(new ProgressEvent('error'));

    expect((failure as ApiError).kind).toBe('network');
  });
});
