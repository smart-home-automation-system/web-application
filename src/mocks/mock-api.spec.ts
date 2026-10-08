import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { BOILER_STATUS_BEFORE_FIRST_LOOK, boilerStatus } from './boiler.fixtures';
import { HEATING_STATUS, resetHeating, temperatureSensors } from './heating.fixtures';
import { HOUSEHOLD_PROFILES } from './household.fixtures';
import { mockApiInterceptors } from './mock-api';
import { WATER_HEATING_DEMAND, WATER_TEMPERATURES } from './water.fixtures';

describe('mock API', () => {
  let http: HttpClient;

  beforeEach(() => {
    localStorage.removeItem('mock-scenario');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([...mockApiInterceptors])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
  });

  afterEach(() => {
    localStorage.removeItem('mock-scenario');
    resetHeating();
  });

  async function failure(request: Promise<unknown>): Promise<HttpErrorResponse> {
    return request.then(
      () => Promise.reject(new Error('the call was expected to fail')),
      (error: HttpErrorResponse) => error,
    );
  }

  it('answers a known endpoint from its fixture', async () => {
    expect(await firstValueFrom(http.get('/home/heating'))).toEqual(HEATING_STATUS);
  });

  describe('the heating', () => {
    const status = () => firstValueFrom(http.get('/home/heating'));
    const turn = (to: string) =>
      firstValueFrom(http.post('/home/heating', null, { params: { turn: to } }));

    it('says that rooms are being heated while the system is on', async () => {
      expect(await firstValueFrom(http.get('/home/heating/status/active'))).toEqual({
        active: true,
      });
    });

    // the page reads the state again after a change: the mock house has to remember it
    it('remembers the switch: the next read of the status answers with what was set', async () => {
      const answered = await turn('off');

      expect(await status()).toEqual(answered);
      expect(await status()).toMatchObject({ isHeatingEnabled: false });
      expect(await firstValueFrom(http.get('/home/heating/status/active'))).toEqual({
        active: false,
      });

      await turn('ON');

      expect(await status()).toMatchObject({ isHeatingEnabled: true });
    });

    it('dates the change now, on the clock of the house', async () => {
      const answered = (await turn('off')) as { updatedAt: string };

      expect(answered.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/);
      expect(answered.updatedAt).not.toBe(HEATING_STATUS.updatedAt);
    });

    it('lists the sensors with one silent and one silent and muted, dated from the call', async () => {
      const sensors = (await firstValueFrom(
        http.get('/home/heating/temperature/sensors'),
      )) as ReturnType<typeof temperatureSensors>;

      expect(sensors.filter((sensor) => sensor.stale).map((sensor) => sensor.room)).toEqual([
        'garden',
        'bathroom down',
      ]);
      expect(sensors.filter((sensor) => sensor.muted).map((sensor) => sensor.room)).toEqual([
        'garden',
      ]);
      expect(temperatureSensors(new Date('2026-07-15T10:00:30Z'))[0].lastReadingAt).toBe(
        '2026-07-15T11:58:10.596721',
      );
    });

    describe('in the scenario of changes that fail', () => {
      beforeEach(() => localStorage.setItem('mock-scenario', 'writes-fail'));

      it('refuses the switch with a 500 and leaves the house as it was', async () => {
        const error = await failure(turn('off'));

        expect(error.status).toBe(500);
        expect(await status()).toEqual(HEATING_STATUS);
      });
    });
  });

  it('answers the household profiles from their fixture', async () => {
    expect(await firstValueFrom(http.get('/home/household/profiles'))).toEqual(HOUSEHOLD_PROFILES);
  });

  it('answers the hot water and the boiler room from their fixtures', async () => {
    expect(await firstValueFrom(http.get('/home/water/status/temperature'))).toEqual(
      WATER_TEMPERATURES,
    );
    expect(await firstValueFrom(http.get('/home/water/status/active'))).toEqual(
      WATER_HEATING_DEMAND,
    );
    const boiler = (await firstValueFrom(http.get('/home/boiler/status'))) as ReturnType<
      typeof boilerStatus
    >;
    expect(Object.keys(boiler.pumps ?? {}).sort()).toEqual(['heating', 'hot_water']);
    expect(boiler.furnace?.working).toBe(true);
  });

  // the service notes every device once a minute: a fixed time would read as a boiler room
  // that stopped reporting long ago
  it('dates the notes of the boiler room a moment before the call, on the clock of the house', () => {
    const status = boilerStatus(new Date('2026-07-15T10:00:30Z'));

    expect(status.furnace?.lastMessageReply?.timestamp).toBe('2026-07-15T12:00:10.596721');
    expect(status.pumps?.heating?.lastMessageReply?.timestamp).toBe('2026-07-15T11:57:25.596721');
  });

  describe('in the scenario of services that have just started', () => {
    beforeEach(() => localStorage.setItem('mock-scenario', 'no-readings'));

    // exactly what water-service does before its first reading: 200 and no body
    it('answers the temperatures with an empty 200', async () => {
      expect(await firstValueFrom(http.get('/home/water/status/temperature'))).toBeNull();
    });

    it('answers the boiler room with devices nothing is noted about', async () => {
      expect(await firstValueFrom(http.get('/home/boiler/status'))).toEqual(
        BOILER_STATUS_BEFORE_FIRST_LOOK,
      );
    });

    // a room that never reported is not in the answer of the service
    it('answers the sensors with an empty list', async () => {
      expect(await firstValueFrom(http.get('/home/heating/temperature/sensors'))).toEqual([]);
    });

    it('answers everything else as usual', async () => {
      expect(await firstValueFrom(http.get('/home/heating'))).toEqual(HEATING_STATUS);
    });
  });

  // the registry itself is not something the application asks for: it carries phones and devices
  it('does not serve the full household registry', async () => {
    expect((await failure(firstValueFrom(http.get('/home/household')))).status).toBe(404);
  });

  it('answers an unknown endpoint like the gateway does: 404 in the error contract', async () => {
    const error = await failure(firstValueFrom(http.get('/home/no/such/endpoint')));

    expect(error.status).toBe(404);
    expect(error.error.errors[0].message).toContain('/home/no/such/endpoint');
  });

  it('leaves calls outside the API alone', () => {
    let received: unknown;
    http.get('/assets/anything.json').subscribe((body) => (received = body));

    TestBed.inject(HttpTestingController)
      .expectOne('/assets/anything.json')
      .flush({ from: 'the real backend' });

    expect(received).toEqual({ from: 'the real backend' });
  });

  it('answers nothing in the offline scenario', async () => {
    localStorage.setItem('mock-scenario', 'offline');

    expect((await failure(firstValueFrom(http.get('/home/heating')))).status).toBe(0);
  });

  it('answers 502 in the server-error scenario', async () => {
    localStorage.setItem('mock-scenario', 'server-error');

    expect((await failure(firstValueFrom(http.get('/home/heating')))).status).toBe(502);
  });
});
