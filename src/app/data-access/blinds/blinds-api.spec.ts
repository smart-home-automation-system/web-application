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
});
