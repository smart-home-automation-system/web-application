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
import { householdProfiles, resetHousehold } from './household.fixtures';
import { mockApiInterceptors } from './mock-api';
import { WaterTemperatures } from '../app/data-access/water/water-api';
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
    resetHousehold();
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

    it('answers one room by its name, in any case, as the service does', async () => {
      const room = (name: string) =>
        firstValueFrom(http.get(`/home/heating/rooms/${encodeURIComponent(name)}`));

      expect(await room('living room')).toMatchObject({ name: 'living room' });
      expect(await room('Living Room')).toMatchObject({ name: 'living room' });
      // the one room of the mock house that reports a humidity
      expect(await room('bedroom')).toMatchObject({ humidity: { value: 46 } });
      expect(await room('loft')).not.toHaveProperty('humidity');
    });

    it('refuses a room the house does not have like the service: a 404 with its code', async () => {
      const refused = await failure(firstValueFrom(http.get('/home/heating/rooms/attic')));

      expect(refused.status).toBe(404);
      expect(refused.error).toEqual({
        errors: [
          {
            code: 'NOT_FOUND_ROOM',
            details: 'Room name: attic',
            message: 'Room with provided name is not a part of home',
          },
        ],
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
        householdProfiles().map((profile) => profile.name),
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
    expect(await firstValueFrom(http.get('/home/household/profiles'))).toEqual(householdProfiles());
  });

  // the registry of the mock house can be changed, and refuses what the real one refuses
  describe('the household registry', () => {
    type Member = Record<string, unknown> & { name: string };
    const registry = () => firstValueFrom(http.get<Member[]>('/home/household'));
    const profiles = () => firstValueFrom(http.get<Member[]>('/home/household/profiles'));
    const one = async (name: string) => (await registry()).find((member) => member.name === name);
    const member = (name: string) => `/home/household/member/${name}`;
    const code = async (request: Promise<unknown>) => {
      const refused = await failure(request);
      const errors = (refused.error as { errors: { code?: string }[] }).errors;
      return [refused.status, errors[0].code];
    };

    it('lists everybody with phone and devices, and leaves empty lists out', async () => {
      const members = await registry();

      expect(members.map((entry) => entry.name)).toEqual([
        'Aurelia',
        'Borys',
        'Celina',
        'Damian',
        'Emil',
      ]);
      expect(await one('Damian')).toEqual({
        name: 'Damian',
        phone: '+48500100104',
        devices: [],
        active: true,
        role: 'resident',
      });
    });

    // what the profiles are for: nothing of the registry beyond name, role, rooms, permissions
    it('keeps the phone, the devices and a member who is switched off out of the profiles', async () => {
      const answer = await profiles();

      expect(answer.map((entry) => entry.name)).not.toContain('Emil');
      expect(answer.flatMap((entry) => Object.keys(entry))).not.toContain('phone');
      expect(answer.flatMap((entry) => Object.keys(entry))).not.toContain('devices');
    });

    it('adds a member as a resident unless a role is named, and without devices', async () => {
      await firstValueFrom(
        http.post('/home/household/member', {
          name: 'Fabian',
          phone: '+48500100106',
          rooms: ['loft'],
        }),
      );

      expect(await one('Fabian')).toEqual({
        name: 'Fabian',
        phone: '+48500100106',
        devices: [],
        active: true,
        role: 'resident',
        rooms: ['loft'],
      });
    });

    it.each([
      [{ name: 'aurelia', phone: '+48500100106' }, [409, 'HOUSEHOLD_CONFLICT']],
      [{ name: 'Fabian', phone: '+48500100101' }, [409, 'HOUSEHOLD_CONFLICT']],
      [{ name: 'Fa', phone: '+48500100106' }, [400, undefined]],
      [{ name: 'Fabian', phone: '500100106' }, [400, undefined]],
      [{ name: 'Fabian', phone: '+48500100106', role: 'owner' }, [400, undefined]],
      [{ name: 'Fabian', phone: '+48500100106', rooms: ['attic'] }, [400, undefined]],
      [
        { name: 'Fabian', phone: '+48500100106', rooms: ['loft', 'loft'] },
        [400, 'INVALID_HOUSEHOLD_MEMBER'],
      ],
    ])('refuses to add %o', async (body, refusal) => {
      expect(await code(firstValueFrom(http.post('/home/household/member', body)))).toEqual(
        refusal,
      );
      expect(await registry()).toHaveLength(5);
    });

    // PATCH never touches the rooms, the permissions or the activity
    it('changes name, phone and a named role, and nothing else', async () => {
      await firstValueFrom(
        http.patch(member('celina'), { name: 'Cecylia', phone: '+48500100199', rooms: [] }),
      );

      expect(await one('Cecylia')).toMatchObject({
        phone: '+48500100199',
        role: 'resident',
        rooms: ['bedroom', 'wardrobe'],
        permissions: ['heating_switch'],
      });
    });

    it('replaces the rooms and the permissions with the lists given', async () => {
      await firstValueFrom(http.put(`${member('Borys')}/rooms`, ['office', 'loft']));
      await firstValueFrom(http.put(`${member('Borys')}/permissions`, ['heating_switch']));
      await firstValueFrom(http.put(`${member('Celina')}/permissions`, []));

      expect(await one('Borys')).toMatchObject({
        rooms: ['office', 'loft'],
        permissions: ['heating_switch'],
      });
      expect(await one('Celina')).not.toHaveProperty('permissions');
      expect(
        await code(firstValueFrom(http.put(`${member('Borys')}/permissions`, [null]))),
      ).toEqual([400, 'INVALID_HOUSEHOLD_MEMBER']);
    });

    it('switches a member off and on, and the profiles follow', async () => {
      await firstValueFrom(http.post(`${member('Borys')}/deactivate`, null));
      expect((await profiles()).map((entry) => entry.name)).not.toContain('Borys');

      await firstValueFrom(http.post(`${member('Borys')}/activate`, null));
      expect((await profiles()).map((entry) => entry.name)).toContain('Borys');
    });

    it('removes a member, and knows nobody under a name it does not hold', async () => {
      await firstValueFrom(http.delete(member('Damian')));

      expect(await one('Damian')).toBeUndefined();
      expect(await code(firstValueFrom(http.delete(member('Damian'))))).toEqual([
        404,
        'NOT_FOUND_HOUSEHOLD_MEMBER',
      ]);
    });

    it('adds, changes and removes a device, addressed by its MAC in any case', async () => {
      const device = `${member('Damian')}/device`;
      await firstValueFrom(http.post(device, { name: 'Phone', mac: '02:00:00:00:d4:01' }));
      await firstValueFrom(
        http.patch(
          device,
          { name: 'Tablet', mac: '02:00:00:00:d4:02' },
          { params: { mac: '02:00:00:00:D4:01' } },
        ),
      );
      expect(await one('Damian')).toMatchObject({
        devices: [{ name: 'Tablet', mac: '02:00:00:00:d4:02' }],
      });

      await firstValueFrom(http.delete(device, { params: { mac: '02:00:00:00:d4:02' } }));
      expect(await one('Damian')).toMatchObject({ devices: [] });
    });

    it.each([
      // registered already, by another member
      [{ name: 'Tablet', mac: '02:00:00:00:b0:01' }, [409, 'DEVICE_EXIST']],
      // a second device of the same name
      [{ name: 'Phone', mac: '02:00:00:00:a1:09' }, [409, 'DEVICE_EXIST']],
      [{ name: 'Tablet', mac: '02:00:00:00:A1:09' }, [400, undefined]],
    ])('refuses the device %o', async (body, refusal) => {
      expect(await code(firstValueFrom(http.post(`${member('Aurelia')}/device`, body)))).toEqual(
        refusal,
      );
    });

    it('knows no device under an address the member does not have', async () => {
      expect(
        await code(
          firstValueFrom(
            http.delete(`${member('Aurelia')}/device`, { params: { mac: '02:00:00:00:b0:01' } }),
          ),
        ),
      ).toEqual([404, 'NOT_FOUND_MEMBER_DEVICE']);
    });

    it('carries out no change in the scenario of failing writes', async () => {
      localStorage.setItem('mock-scenario', 'writes-fail');

      expect((await failure(firstValueFrom(http.delete(member('Damian'))))).status).toBe(500);
      expect(await registry()).toHaveLength(5);
    });
  });

  it('answers the hot water and the boiler room from their fixtures', async () => {
    // the reading with the time the sensors were read, to the second and a moment ago
    const temperatures = (await firstValueFrom(
      http.get('/home/water/status/temperature'),
    )) as WaterTemperatures;
    expect(temperatures).toEqual({ ...WATER_TEMPERATURES, measuredAt: temperatures.measuredAt });
    expect(temperatures.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
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
