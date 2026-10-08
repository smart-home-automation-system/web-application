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
import {
  HEATING_STATUS,
  floorPump,
  heatingRooms,
  resetHeating,
  temperatureSensors,
} from './heating.fixtures';
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

    it('answers the rooms: every case the page has to show, the names being those of the SDK', async () => {
      const rooms = (await firstValueFrom(http.get('/home/heating/rooms'))) as ReturnType<
        typeof heatingRooms
      >;
      const named = (name: string) => rooms.find((room) => room.name === name)!;

      expect(rooms.map((room) => room.name)).toEqual([
        'office',
        'bedroom',
        'wardrobe',
        'bathroom up',
        'loft',
        'living room',
        'bathroom down',
        'sauna',
        'garden',
      ]);
      // a room that never reported, rooms without a heater, a heater without a schedule,
      // a relay that has not answered and a room with two heaters
      expect(named('sauna')).toEqual({ name: 'sauna', mode: 'HEATING', heaters: [] });
      expect(named('loft').heaters).toEqual([]);
      expect(named('bathroom down').heaters?.[0].schedules).toEqual([]);
      expect(named('wardrobe').heaters?.[0].working).toBeUndefined();
      expect(named('wardrobe').heatingEnabled).toBeUndefined();
      expect(named('living room').heaters?.map((heater) => heater.type)).toEqual([
        'radiator',
        'floor',
      ]);
    });

    // Thursday 8 October 2026 on the clock of the house: 14:30, then 23:30
    it('works out what a schedule asks for at the moment of the call, like the service', () => {
      const office = (at: string) => heatingRooms(new Date(at))[0];

      const afternoon = office('2026-10-08T12:30:00Z');
      expect(afternoon.temperature).toEqual({
        value: 21.3,
        updatedAt: '2026-10-08T14:27:40.596721',
      });
      expect(afternoon.heaters?.[0]).toMatchObject({
        working: false,
        updatedAt: '2026-10-08T14:27:40.596721',
        // warm enough: a period is on, and the room is not colder than it asks
        inSchedule: false,
        scheduledTemperature: 20.5,
      });
      expect(afternoon.heaters?.[0].targetTemperature).toBeUndefined();

      const night = office('2026-10-08T21:30:00Z').heaters?.[0];
      expect(night?.scheduledTemperature).toBeUndefined();
      expect(night?.inSchedule).toBe(false);

      // both ends of a period are excluded
      expect(office('2026-10-08T05:00:00Z').heaters?.[0].scheduledTemperature).toBeUndefined();
      expect(office('2026-10-08T05:01:00Z').heaters?.[0].scheduledTemperature).toBe(20.5);
    });

    it('answers a room that is being heated with the target next to "in schedule"', () => {
      const livingRoom = heatingRooms(new Date('2026-10-08T12:30:00Z')).find(
        (room) => room.name === 'living room',
      );

      expect(livingRoom?.heatingEnabled).toBe(true);
      expect(livingRoom?.heaters?.[0]).toMatchObject({
        working: true,
        inSchedule: true,
        targetTemperature: 21.5,
        scheduledTemperature: 21.5,
      });
    });

    it('answers the pump of the floor heating, dated a moment before the call', async () => {
      expect(await firstValueFrom(http.get('/home/heating/floor-pump'))).toMatchObject({
        working: true,
      });
      expect(floorPump(new Date('2026-07-15T10:00:30Z'))).toEqual({
        working: true,
        updatedAt: '2026-07-15T11:58:25.596721',
      });
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

  describe('the presence', () => {
    const range = { params: { from: '2026-10-07T00:00:00', to: '2026-10-08T00:00:00' } };

    it('answers who is at home, one entry per member of the household', async () => {
      const now = (await firstValueFrom(http.get('/home/presence/residents/presence'))) as {
        name: string;
      }[];

      expect(now.map((resident) => resident.name)).toEqual(
        HOUSEHOLD_PROFILES.map((profile) => profile.name),
      );
    });

    // the name is part of the path, percent-encoded like the application sends it
    it('answers the two reports of the resident named in the path', async () => {
      const report = await firstValueFrom(
        http.get('/home/presence/residents/Aurelia/report', range),
      );
      const daily = await firstValueFrom(
        http.get('/home/presence/residents/Aurelia/report/daily', range),
      );

      expect(report).toMatchObject({ name: 'Aurelia', from: range.params.from });
      expect(daily).toMatchObject({ name: 'Aurelia', days: [{ date: '2026-10-07' }] });
    });

    it('answers the house', async () => {
      expect(await firstValueFrom(http.get('/home/presence/house/report', range))).toMatchObject({
        days: [{ date: '2026-10-07' }],
      });
    });

    it('refuses like the service, in the error contract', async () => {
      const unknown = await failure(
        firstValueFrom(http.get('/home/presence/residents/No%20Body/report', range)),
      );
      const noRange = await failure(firstValueFrom(http.get('/home/presence/house/report')));

      expect(unknown.status).toBe(404);
      expect(unknown.error.errors[0].message).toBe('Unknown resident: No Body');
      expect(noRange.status).toBe(400);
    });

    // every MAC address of the network: the gateway does not route it, the mock does not serve it
    it('does not serve the list of network clients', async () => {
      expect((await failure(firstValueFrom(http.get('/home/presence/clients')))).status).toBe(404);
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

    // heating-service after its first start: rooms and schedules, nothing measured or decided
    it('answers the rooms with nothing measured, reported or decided', async () => {
      const rooms = (await firstValueFrom(http.get('/home/heating/rooms'))) as ReturnType<
        typeof heatingRooms
      >;
      const heaters = rooms.flatMap((room) => room.heaters ?? []);

      expect(rooms).toHaveLength(9);
      expect(rooms.filter((room) => room.temperature || 'heatingEnabled' in room)).toEqual([]);
      expect(heaters.filter((heater) => 'working' in heater || 'inSchedule' in heater)).toEqual([]);
      expect(heaters.filter((heater) => heater.schedules!.length > 0)).not.toEqual([]);
    });

    it('answers the pump of the floor heating with nothing about it', async () => {
      expect(await firstValueFrom(http.get('/home/heating/floor-pump'))).toEqual({});
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
