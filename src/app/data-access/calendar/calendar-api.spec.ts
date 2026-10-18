import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CalendarApi, holidaysOf } from './calendar-api';

// HAS-252: the calendar of the house, read only - the holidays the schedules of the blinds count
describe('CalendarApi', () => {
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

  // the day is the house's: half past midnight in Warsaw is still the day before in UTC
  it('asks for the days from today of the house on, the end not included', () => {
    vi.setSystemTime(new Date('2026-10-18T22:30:00Z')); // 00:30 on 19 October in Warsaw
    TestBed.runInInjectionContext(() => TestBed.inject(CalendarApi).watchDays(60));
    vi.advanceTimersByTime(0);

    const request = http.expectOne((call) => call.url === '/home/calendar/days');
    expect(request.request.params.get('from')).toBe('2026-10-19');
    expect(request.request.params.get('to')).toBe('2026-12-18');
    request.flush([]);
  });
});

describe('holidaysOf', () => {
  it('lists the days off of the working week, by the date and never by the reason', () => {
    expect(
      holidaysOf([
        { date: '2026-11-10', type: 'workday' },
        { date: '2026-11-11', type: 'day off', reason: 'Independence Day' },
        // a holiday on a Sunday: a weekend anyway
        { date: '2026-11-01', type: 'day off', reason: "All Saints' Day" },
        { date: '2026-11-14', type: 'day off', reason: 'Saturday' },
        // a day of the household on a weekday, without a reason
        { date: '2026-11-12', type: 'day off' },
        { date: 'not a date', type: 'day off', reason: 'x' },
        'not a day',
      ]),
    ).toEqual([{ date: '2026-11-11', reason: 'Independence Day' }, { date: '2026-11-12' }]);
  });

  it('has no list where the answer is none', () => {
    expect(holidaysOf(null)).toBeUndefined();
    expect(holidaysOf({})).toBeUndefined();
    expect(holidaysOf([])).toEqual([]);
  });
});
