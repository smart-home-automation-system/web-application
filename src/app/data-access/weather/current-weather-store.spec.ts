import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CurrentWeatherStore } from './current-weather-store';

describe('CurrentWeatherStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => vi.useRealTimers());

  // the strip and the tile of the overview read one resource: one call a minute, one answer
  it('polls once for everybody who reads it', () => {
    const http = TestBed.inject(HttpTestingController);
    const strip = TestBed.inject(CurrentWeatherStore).current;
    const tile = TestBed.inject(CurrentWeatherStore).current;

    vi.advanceTimersByTime(1);
    http.expectOne('/home/weather/current').flush({});

    expect(tile).toBe(strip);
    vi.advanceTimersByTime(60_000);
    http.expectOne('/home/weather/current').flush({});
    http.verify();
  });
});
