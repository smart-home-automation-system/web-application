import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { HistoryRange } from '../../core/time/history-range';
import { WaterApi } from './water-api';

const DAY: HistoryRange = { from: '2026-10-09T19:00:00', to: '2026-10-10T19:00:00' };
const WEEK: HistoryRange = { from: '2026-10-04T00:00:00', to: '2026-10-11T00:00:00' };

describe('WaterApi', () => {
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

  /** The read of the history that is due now. (A millisecond: a timer fires a tick later.) */
  function historyCall() {
    vi.advanceTimersByTime(1);
    return http.expectOne(
      (request) => request.method === 'GET' && request.url === '/home/water/temperature/history',
    );
  }

  describe('the history', () => {
    // the page asks with from / to and never chooses the bucket: that is for the service
    it('asks with the two ends of the range and nothing else', () => {
      TestBed.runInInjectionContext(() => TestBed.inject(WaterApi).watchHistory(() => DAY));

      const call = historyCall();

      expect(call.request.params.keys().sort()).toEqual(['from', 'to']);
      expect(call.request.params.get('from')).toBe('2026-10-09T19:00:00');
      expect(call.request.params.get('to')).toBe('2026-10-10T19:00:00');
      call.flush({ from: DAY.from, to: DAY.to, bucketSeconds: 300, points: [] });
    });

    it('answers with the range it asked for', () => {
      const history = TestBed.runInInjectionContext(() =>
        TestBed.inject(WaterApi).watchHistory(() => DAY),
      );
      const answer = { from: DAY.from, to: DAY.to, bucketSeconds: 300, points: [] };

      historyCall().flush(answer);

      expect(history.value()).toEqual({ query: DAY, answer });
      expect(history.settledFor()?.query).toBe(DAY);
    });

    it('asks again at once when the range changes, and drops the answer on its way', () => {
      const range = signal(DAY);
      const history = TestBed.runInInjectionContext(() =>
        TestBed.inject(WaterApi).watchHistory(range),
      );
      const first = historyCall();

      range.set(WEEK);
      TestBed.tick();
      const second = historyCall();

      expect(first.cancelled).toBe(true);
      expect(second.request.params.get('from')).toBe('2026-10-04T00:00:00');
      second.flush({ bucketSeconds: 1800, points: [] });
      expect(history.value()?.query).toBe(WEEK);
    });

    // a failed call settles its question too: the view shows that failure, not a bar for ever
    it('says which range a failed call was for', () => {
      const history = TestBed.runInInjectionContext(() =>
        TestBed.inject(WaterApi).watchHistory(() => DAY),
      );

      historyCall().flush(
        { errors: [{ message: 'from must be before to' }] },
        { status: 400, statusText: 'Bad Request' },
      );

      expect(history.error()?.status).toBe(400);
      expect(history.settledFor()?.query).toBe(DAY);
      expect(history.value()).toBeUndefined();
    });
  });
});
