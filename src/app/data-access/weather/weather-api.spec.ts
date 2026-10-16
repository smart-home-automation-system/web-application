import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { WeatherApi, WeatherHistoryQuery } from './weather-api';

const DAY: WeatherHistoryQuery = {
  metric: 'temperature',
  from: '2026-10-15T15:00:00',
  to: '2026-10-16T15:00:00',
};

describe('WeatherApi', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  /** The read of `path` that is due now. (A millisecond: a timer fires a tick later.) */
  function call(path: string) {
    vi.advanceTimersByTime(1);
    return http.expectOne((request) => request.method === 'GET' && request.url === path);
  }

  describe('the current weather', () => {
    it('is read every minute', () => {
      const current = TestBed.runInInjectionContext(() =>
        TestBed.inject(WeatherApi).watchCurrent(),
      );
      const answer = {
        temperature: { value: 9.5, measuredAt: '2026-10-16T14:00:00', stale: false },
      };

      call('/home/weather/current').flush(answer);
      expect(current.value()).toEqual(answer);

      vi.advanceTimersByTime(59_000);
      http.expectNone('/home/weather/current');
      vi.advanceTimersByTime(1_000);
      http.expectOne('/home/weather/current').flush({});
      expect(current.value()).toEqual({});
    });

    // two missed calls, not the 2.5 intervals of the other resources
    it('is stale once two calls in a row brought nothing', () => {
      const current = TestBed.runInInjectionContext(() =>
        TestBed.inject(WeatherApi).watchCurrent(),
      );
      call('/home/weather/current').flush({});
      const answeredAt = Date.now();

      // the clock moves on without the interval running (no call is made), and the shared
      // ticker, which counts every few seconds, reads it
      vi.setSystemTime(answeredAt + 115_000);
      vi.advanceTimersByTime(5_000);
      expect(current.stale()).toBe(false);

      vi.setSystemTime(answeredAt + 121_000);
      vi.advanceTimersByTime(5_000);
      expect(current.stale()).toBe(true);
    });
  });

  it('reads the status of the station', () => {
    const status = TestBed.runInInjectionContext(() => TestBed.inject(WeatherApi).watchStatus());

    call('/home/weather/status').flush({ silent: true });

    expect(status.value()).toEqual({ silent: true });
  });

  describe('the history', () => {
    it('asks for one metric with the two ends of the range and nothing else', () => {
      TestBed.runInInjectionContext(() => TestBed.inject(WeatherApi).watchHistory(() => DAY));

      const history = call('/home/weather/history');

      expect(history.request.params.keys().sort()).toEqual(['from', 'metric', 'to']);
      expect(history.request.params.get('metric')).toBe('temperature');
      expect(history.request.params.get('from')).toBe('2026-10-15T15:00:00');
      expect(history.request.params.get('to')).toBe('2026-10-16T15:00:00');
      history.flush({ metric: 'temperature', bucketSeconds: 300, points: [] });
    });

    it('asks again at once for another metric, and tags the answer with its question', () => {
      const query = signal(DAY);
      const history = TestBed.runInInjectionContext(() =>
        TestBed.inject(WeatherApi).watchHistory(query),
      );
      const first = call('/home/weather/history');

      const wind: WeatherHistoryQuery = { ...DAY, metric: 'wind' };
      query.set(wind);
      TestBed.tick();
      const second = call('/home/weather/history');

      expect(first.cancelled).toBe(true);
      expect(second.request.params.get('metric')).toBe('wind');
      second.flush({ metric: 'wind', bucketSeconds: 300, points: [] });
      expect(history.value()?.query).toBe(wind);
      expect(history.settledFor()?.query).toBe(wind);
    });
  });
});
