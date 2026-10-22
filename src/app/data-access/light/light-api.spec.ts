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

  it('sets the colour of a light with the dashboard as its source', async () => {
    const sent = firstValueFrom(lights.color(41, { rgb: [255, 140, 0], white: 10 }), {
      defaultValue: undefined,
    });

    const request = http.expectOne((call) => call.url === '/home/light/41/color');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ rgb: [255, 140, 0], white: 10 });
    expect(request.request.params.get('source')).toBe('dashboard');
    request.flush(null, { status: 202, statusText: 'Accepted' });
    await sent;
  });

  it('switches a room by its name, encoded as a path segment, and answers what each light did', async () => {
    const sent = firstValueFrom(lights.roomTurn('living room', false));

    const request = http.expectOne((call) => call.url === '/home/light/rooms/living%20room');
    expect(request.request.method).toBe('POST');
    expect(request.request.params.get('turn')).toBe('off');
    expect(request.request.params.get('source')).toBe('dashboard');
    const answer = { room: 'living room', turn: 'off', switched: [{ id: 5 }], failed: [] };
    request.flush(answer, { status: 202, statusText: 'Accepted' });
    expect(await sent).toEqual(answer);
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

  // HAS-268: the card of My room - one room, its rule and the switch of the resident
  it('reads one room and its rule by the name of the room, encoded as a path segment', () => {
    vi.useFakeTimers();
    try {
      TestBed.runInInjectionContext(() => {
        lights.watchRoom(() => 'living room');
        lights.watchRoomRule(() => 'living room');
      });
      vi.advanceTimersByTime(0);

      const room = http.expectOne('/home/light/rooms/living%20room');
      expect(room.request.method).toBe('GET');
      room.flush({ room: 'living room', lights: [] });
      const rule = http.expectOne('/home/light/rooms/living%20room/rules');
      expect(rule.request.method).toBe('GET');
      rule.flush({ room: 'living room' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('writes the switch of the resident as a body, and answers the rule as stored', async () => {
    const answer = firstValueFrom(lights.residentEnabled('living room', false));

    const request = http.expectOne('/home/light/rooms/living%20room/rules/resident-enabled');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ enabled: false });
    request.flush({ room: 'living room', enabledByResident: false });

    expect(await answer).toEqual({ room: 'living room', enabledByResident: false });
  });
});
