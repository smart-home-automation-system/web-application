import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { ApiError } from '../../core/api/api-error';
import { HeatingApi } from './heating-api';

const BODY = { days: ['SATURDAY'], startTime: '09:00', endTime: '22:00', temperature: 21 };

// HAS-357: the four writes of a period of heating-service 1.14.0, by their paths
describe('HeatingApi - the writes of the schedules', () => {
  let http: HttpTestingController;
  let api: HeatingApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(HeatingApi);
  });

  afterEach(() => http.verify());

  it('creates a period of a heater, the room a path segment', async () => {
    const done = firstValueFrom(api.createSchedule('living room', 'radiator', BODY));
    const sent = http.expectOne({
      method: 'POST',
      url: '/home/heating/rooms/living%20room/heaters/radiator/schedules',
    });
    expect(sent.request.body).toEqual(BODY);
    sent.flush({ id: 31 }, { status: 201, statusText: 'Created' });

    // the answer repeats the period and is not used
    await expect(done).resolves.toBeUndefined();
  });

  it('never asks for a room of dots alone, which the browser would resolve away', async () => {
    await expect(firstValueFrom(api.createSchedule('..', 'radiator', BODY))).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it('replaces, switches and removes a period by its id', () => {
    api.replaceSchedule(31, BODY).subscribe();
    expect(
      http.expectOne({ method: 'PUT', url: '/home/heating/schedules/31' }).request.body,
    ).toEqual(BODY);

    api.setScheduleEnabled(31, false).subscribe();
    http
      .expectOne({ method: 'PUT', url: '/home/heating/schedules/31/enabled?value=false' })
      .flush(null);

    api.deleteSchedule(31).subscribe();
    http.expectOne({ method: 'DELETE', url: '/home/heating/schedules/31' }).flush(null);
  });
});
