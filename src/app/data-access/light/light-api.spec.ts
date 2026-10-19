import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { LightApi } from './light-api';

// HAS-292: the commands of light-service - by the registry id, with the dashboard as their source
describe('LightApi', () => {
  let http: HttpTestingController;
  let lights: LightApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    lights = TestBed.inject(LightApi);
  });

  afterEach(() => http.verify());

  it('switches a light by its registry id with the dashboard as its source', async () => {
    const sent = firstValueFrom(lights.turn(39, true), { defaultValue: undefined });

    const request = http.expectOne((call) => call.url === '/home/light/39');
    expect(request.request.method).toBe('POST');
    expect(request.request.params.get('turn')).toBe('on');
    expect(request.request.params.get('source')).toBe('dashboard');
    request.flush(null, { status: 202, statusText: 'Accepted' });
    await sent;

    const off = firstValueFrom(lights.turn(39, false), { defaultValue: undefined });
    const second = http.expectOne((call) => call.url === '/home/light/39');
    expect(second.request.params.get('turn')).toBe('off');
    second.flush(null, { status: 202, statusText: 'Accepted' });
    await off;
  });

  it('sets the brightness of a light', async () => {
    const sent = firstValueFrom(lights.brightness(45, 60), { defaultValue: undefined });

    const request = http.expectOne((call) => call.url === '/home/light/45/brightness');
    expect(request.request.method).toBe('POST');
    expect(request.request.params.get('value')).toBe('60');
    expect(request.request.params.get('source')).toBe('dashboard');
    request.flush(null, { status: 202, statusText: 'Accepted' });
    await sent;
  });
});
