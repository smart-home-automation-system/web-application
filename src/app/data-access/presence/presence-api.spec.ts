import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PresenceApi, ReportRange, ResidentQuery } from './presence-api';

const WEEK: ReportRange = { from: '2026-10-02T00:00:00', to: '2026-10-09T00:00:00' };
const TODAY: ReportRange = { from: '2026-10-08T00:00:00', to: '2026-10-09T00:00:00' };
const params = (range: ReportRange) => `from=${range.from}&to=${range.to}`;

describe('PresenceApi', () => {
  let http: HttpTestingController;
  let api: PresenceApi;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(PresenceApi);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  /** Lets the effects run and the call that is due go out. */
  function settle(): void {
    TestBed.tick();
    vi.advanceTimersByTime(1);
  }

  it('reads who is at home now', () => {
    const now = TestBed.runInInjectionContext(() => api.watchNow());
    settle();

    http.expectOne('/home/presence/residents/presence').flush([{ name: 'Aurelia', present: true }]);

    expect(now.value()).toEqual([{ name: 'Aurelia', present: true }]);
  });

  describe('the house', () => {
    it('asks for the range, and tags the answer with it', () => {
      const range = signal(WEEK);
      const house = TestBed.runInInjectionContext(() => api.watchHouse(range));
      settle();

      http.expectOne(`/home/presence/house/report?${params(WEEK)}`).flush({ days: [] });

      expect(house.value()).toEqual({ query: WEEK, answer: { days: [] } });
      expect(house.value()?.query).toBe(WEEK);
    });

    it('asks again at once when the range changes, and drops the answer on its way', () => {
      const range = signal(WEEK);
      const house = TestBed.runInInjectionContext(() => api.watchHouse(range));
      settle();
      const first = http.expectOne(`/home/presence/house/report?${params(WEEK)}`);

      range.set(TODAY);
      settle();

      expect(first.cancelled).toBe(true);
      http.expectOne(`/home/presence/house/report?${params(TODAY)}`).flush({ days: [] });
      expect(house.value()?.query).toBe(TODAY);
    });

    it('makes one call at the start, not two', () => {
      TestBed.runInInjectionContext(() => api.watchHouse(signal(WEEK)));
      settle();
      settle();

      http.expectOne(`/home/presence/house/report?${params(WEEK)}`).flush({});
    });
  });

  describe('a resident', () => {
    const path = '/home/presence/residents/Aurelia/report';

    it('asks for the periods and the days together, and answers with both', () => {
      const query = signal<ResidentQuery | undefined>({ name: 'Aurelia', range: WEEK });
      const history = TestBed.runInInjectionContext(() => api.watchResident(query));
      settle();

      http.expectOne(`${path}?${params(WEEK)}`).flush({ intervals: [] });
      expect(history.value()).toBeUndefined();
      http.expectOne(`${path}/daily?${params(WEEK)}`).flush({ days: [] });

      expect(history.value()?.answer).toEqual({ report: { intervals: [] }, daily: { days: [] } });
      expect(history.value()?.query).toBe(query());
    });

    it('is one failure when either call fails', () => {
      const query = signal<ResidentQuery | undefined>({ name: 'Aurelia', range: WEEK });
      const history = TestBed.runInInjectionContext(() => api.watchResident(query));
      settle();

      http.expectOne(`${path}?${params(WEEK)}`).flush({ intervals: [] });
      http
        .expectOne(`${path}/daily?${params(WEEK)}`)
        .flush(
          { errors: [{ message: 'Unknown resident: Aurelia' }] },
          { status: 404, statusText: 'Not Found' },
        );

      expect(history.error()?.status).toBe(404);
      expect(history.value()).toBeUndefined();
      // the failure is that of this question, and the resource says so
      expect(history.settledFor()?.query).toBe(query());
    });

    it('says which question its last call was for only once that call has ended', () => {
      const first: ResidentQuery = { name: 'Aurelia', range: WEEK };
      const second: ResidentQuery = { name: 'Borys', range: WEEK };
      const query = signal<ResidentQuery | undefined>(first);
      const history = TestBed.runInInjectionContext(() => api.watchResident(query));
      settle();
      expect(history.settledFor()).toBeUndefined();
      http.match(() => true).forEach((call) => call.flush({}));
      expect(history.settledFor()?.query).toBe(first);

      query.set(second);
      settle();

      expect(history.settledFor()?.query).toBe(first);
      http.match(() => true).forEach((call) => call.flush({}));
      expect(history.settledFor()?.query).toBe(second);
    });

    // the browser resolves a segment of dots away before it sends anything
    it.each(['.', '..'])('does not ask for a resident named "%s"', (name) => {
      const query = signal<ResidentQuery | undefined>({ name, range: WEEK });
      const history = TestBed.runInInjectionContext(() => api.watchResident(query));
      settle();

      http.expectNone(() => true);
      expect(history.error()?.kind).toBe('unexpected');
    });

    // a name is a path segment: a space or a slash in it must not change the path
    it('encodes the name in the path', () => {
      const query = signal<ResidentQuery | undefined>({ name: 'Ann a/b', range: WEEK });
      TestBed.runInInjectionContext(() => api.watchResident(query));
      settle();

      const calls = http.match(() => true);

      expect(calls.map((call) => call.request.url)).toEqual([
        '/home/presence/residents/Ann%20a%2Fb/report',
        '/home/presence/residents/Ann%20a%2Fb/report/daily',
      ]);
      calls.forEach((call) => call.flush({}));
    });

    it('calls nothing while there is nobody to ask about, and asks once there is', () => {
      const query = signal<ResidentQuery | undefined>(undefined);
      const history = TestBed.runInInjectionContext(() => api.watchResident(query));
      settle();

      expect(history.value()).toEqual({ query: undefined, answer: null });

      query.set({ name: 'Aurelia', range: WEEK });
      settle();

      http.expectOne(`${path}?${params(WEEK)}`).flush({});
      http.expectOne(`${path}/daily?${params(WEEK)}`).flush({});
    });
  });
});
