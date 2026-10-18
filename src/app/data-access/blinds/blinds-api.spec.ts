import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { LightsApi } from '../lights/lights-api';
import { BlindsApi } from './blinds-api';

// the calls of the room view (HAS-232): the paths of the gateway and what each sends
describe('BlindsApi and LightsApi', () => {
  let http: HttpTestingController;
  let blinds: BlindsApi;
  let lights: LightsApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    blinds = TestBed.inject(BlindsApi);
    lights = TestBed.inject(LightsApi);
  });

  afterEach(() => http.verify());

  it('moves a blind with the dashboard as its source', async () => {
    const sent = firstValueFrom(blinds.move(7, 'close'), { defaultValue: undefined });

    const request = http.expectOne((call) => call.url === '/home/blinds/7');
    expect(request.request.method).toBe('POST');
    expect(request.request.params.get('command')).toBe('close');
    expect(request.request.params.get('source')).toBe('dashboard');
    request.flush(null, { status: 202, statusText: 'Accepted' });
    await sent;
  });

  it('sends a blind to a position', async () => {
    const sent = firstValueFrom(blinds.moveTo(1, 30), { defaultValue: undefined });

    const request = http.expectOne((call) => call.url === '/home/blinds/1/position');
    expect(request.request.method).toBe('POST');
    expect(request.request.params.get('value')).toBe('30');
    request.flush(null, { status: 202, statusText: 'Accepted' });
    await sent;
  });

  it('pauses and resumes the schedules of a blind', async () => {
    const paused = firstValueFrom(blinds.pauseSchedules(2), { defaultValue: undefined });
    const pause = http.expectOne('/home/blinds/2/schedule-pause');
    expect(pause.request.method).toBe('PUT');
    pause.flush(null, { status: 204, statusText: 'No Content' });
    await paused;

    const resumed = firstValueFrom(blinds.resumeSchedules(2), { defaultValue: undefined });
    const resume = http.expectOne('/home/blinds/2/schedule-pause');
    expect(resume.request.method).toBe('DELETE');
    resume.flush(null, { status: 204, statusText: 'No Content' });
    await resumed;
  });

  it('switches an Eaton light and sets a dimmer by its point', async () => {
    const on = firstValueFrom(lights.switch(12, true), { defaultValue: undefined });
    const switched = http.expectOne((call) => call.url === '/home/amx/lights/12');
    expect(switched.request.method).toBe('POST');
    expect(switched.request.params.get('turn')).toBe('on');
    switched.flush({ point: 12, status: 'OK' }, { status: 202, statusText: 'Accepted' });
    await on;

    const level = firstValueFrom(lights.setLevel(12, 60), { defaultValue: undefined });
    const dimmed = http.expectOne((call) => call.url === '/home/amx/lights/12/level');
    expect(dimmed.request.params.get('value')).toBe('60');
    dimmed.flush({ point: 12, status: 'OK' }, { status: 202, statusText: 'Accepted' });
    await level;
  });

  // HAS-252: the blinds page
  it('moves a room and answers with the blinds it skipped', async () => {
    const sent = firstValueFrom(blinds.moveRoom('living room', 'open'));

    const request = http.expectOne((call) => call.url === '/home/blinds/rooms/living%20room');
    expect(request.request.method).toBe('POST');
    expect(request.request.params.get('command')).toBe('open');
    expect(request.request.params.get('source')).toBe('dashboard');
    request.flush(
      {
        room: 'living room',
        command: 'open',
        moved: [{ id: 7, name: 'Terrace blinds' }],
        failed: [{ id: 8, name: 'Side blinds', code: 'DEVICE_FAILED' }],
      },
      { status: 202, statusText: 'Accepted' },
    );

    expect(await sent).toEqual([{ id: 8, name: 'Side blinds', code: 'DEVICE_FAILED' }]);
  });

  it('switches a schedule on and off', async () => {
    const on = firstValueFrom(blinds.setScheduleEnabled(3, true), { defaultValue: undefined });
    const enable = http.expectOne('/home/blinds/schedules/3/enable');
    expect(enable.request.method).toBe('POST');
    enable.flush({ id: 3, enabled: true });
    await on;

    const off = firstValueFrom(blinds.setScheduleEnabled(3, false), { defaultValue: undefined });
    http.expectOne('/home/blinds/schedules/3/disable').flush({ id: 3, enabled: false });
    await off;
  });

  describe('the schedules with their day', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('asks for the day of each schedule one after the other, a failed day kept apart', () => {
      const schedules = TestBed.runInInjectionContext(() => blinds.watchSchedules());
      vi.advanceTimersByTime(0);

      http
        .expectOne('/home/blinds/schedules')
        .flush([{ id: 1, name: 'Morning' }, { name: 'Without an id' }, { id: 2, name: 'Shade' }]);
      // one call at a time: the second day is asked for once the first has answered
      http.expectOne('/home/blinds/schedules/1/today').flush({ scheduleId: 1, decision: 'fires' });
      http
        .expectOne('/home/blinds/schedules/2/today')
        .flush(null, { status: 500, statusText: 'Server Error' });

      const entries = schedules.value();
      expect(entries).toHaveLength(3);
      expect(entries?.[0]).toEqual({
        schedule: { id: 1, name: 'Morning' },
        today: { scheduleId: 1, decision: 'fires' },
      });
      // a schedule without an id cannot be asked about
      expect(entries?.[1]).toEqual({ schedule: { name: 'Without an id' } });
      expect(entries?.[2].todayError?.kind).toBe('server');
      // the failure of one day is not the failure of the list
      expect(schedules.error()).toBeUndefined();
    });

    it('answers a list without a body as null, and asks for no day', () => {
      const schedules = TestBed.runInInjectionContext(() => blinds.watchSchedules());
      vi.advanceTimersByTime(0);

      http.expectOne('/home/blinds/schedules').flush(null);

      expect(schedules.value()).toBeNull();
    });
  });

  // HAS-253: of the answer of a new schedule only its id is used - the schedule is read again
  it('answers the id of a new schedule, and nothing for an answer without one', async () => {
    const created = firstValueFrom(blinds.createSchedule({ name: 'Night' }));
    const request = http.expectOne('/home/blinds/schedules');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'Night' });
    request.flush({ id: 4, name: 'Night' }, { status: 201, statusText: 'Created' });
    expect(await created).toBe(4);

    const without = firstValueFrom(blinds.createSchedule({ name: 'Night' }));
    http.expectOne('/home/blinds/schedules').flush(null, { status: 201, statusText: 'Created' });
    expect(await without).toBeUndefined();
  });
});
