import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { FakeResource, answer, fail, fakeResource } from '../../../testing/fake-resource';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { BlindsApi, RoomBlinds } from '../../data-access/blinds/blinds-api';
import { EmptyHouse, LightApi, RoomLights } from '../../data-access/light/light-api';
import { BoilerApi, BoilerStatus } from '../../data-access/boiler/boiler-api';
import {
  HeatingApi,
  HeatingStatus,
  Room,
  TemperatureSensor,
} from '../../data-access/heating/heating-api';
import { PresenceApi, ResidentPresence } from '../../data-access/presence/presence-api';
import { WaterApi, WaterTemperatures } from '../../data-access/water/water-api';
import { CurrentWeather, WeatherApi } from '../../data-access/weather/weather-api';
import { Overview } from './overview';

// 18:30 in the house (summer time, UTC+2)
const NOW = new Date('2026-10-10T16:30:00Z');

const ROOMS: readonly Room[] = [
  {
    name: 'living room',
    temperature: { value: 21.44, updatedAt: '2026-10-10T18:28:00' },
    heaters: [{ type: 'radiator', working: true }],
  },
  {
    name: 'bedroom',
    temperature: { value: 18.9, updatedAt: '2026-10-10T18:27:00' },
    heaters: [{ type: 'radiator', working: false }],
  },
  { name: 'garage', heaters: [] },
  // outside the house: counted, and never its coldest room
  { name: 'garden', temperature: { value: 4, updatedAt: '2026-10-10T18:20:00' }, heaters: [] },
];

const SENSORS: readonly TemperatureSensor[] = [
  { room: 'living room', lastReadingAt: '2026-10-10T18:28:00', stale: false, muted: false },
  { room: 'bathroom down', lastReadingAt: '2026-10-07T09:00:00', stale: true, muted: false },
  { room: 'sauna', lastReadingAt: '2026-08-21T09:00:00', stale: true, muted: true },
];

const BOILER: BoilerStatus = {
  furnace: { working: true },
  pumps: { hot_water: { working: false }, heating: {} },
};

const PEOPLE: readonly ResidentPresence[] = [
  { name: 'Aurelia', present: true, lastCheckedAt: '2026-10-10T18:29:00' },
  { name: 'Borys', present: false, lastCheckedAt: '2026-10-10T18:29:00' },
  { name: 'Cecylia', present: false, lastCheckedAt: null },
];

const WEATHER: CurrentWeather = {
  temperature: { value: 12.34, measuredAt: '2026-10-10T18:29:10', stale: false },
  dewPoint: { value: 6.07, measuredAt: '2026-10-10T18:29:10', stale: false },
  wind: { value: 3.2, measuredAt: '2026-10-10T18:29:20', stale: false },
  gust: { value: 5.71, measuredAt: '2026-10-10T18:29:20', stale: false },
  raining: { value: false, measuredAt: '2026-10-10T18:28:40', stale: false },
  illuminance: { value: 21310, measuredAt: '2026-10-10T18:29:00', stale: false },
  humidity: { value: 58, measuredAt: '2026-10-10T18:29:10', stale: false },
};

type Tile = 'heating' | 'water' | 'boiler' | 'presence' | 'weather' | 'blinds' | 'light';

describe('Overview', () => {
  let heating: FakeResource<HeatingStatus>;
  let rooms: FakeResource<readonly Room[] | null>;
  let sensors: FakeResource<readonly TemperatureSensor[] | null>;
  let water: FakeResource<WaterTemperatures | null>;
  let boiler: FakeResource<BoilerStatus>;
  let presence: FakeResource<readonly ResidentPresence[] | null>;
  let weather: FakeResource<CurrentWeather | null>;
  let blinds: FakeResource<readonly RoomBlinds[] | null>;
  let lights: FakeResource<readonly RoomLights[] | null>;
  let emptyHouse: FakeResource<EmptyHouse | null>;
  let fixture: ComponentFixture<Overview>;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    heating = fakeResource();
    rooms = fakeResource();
    sensors = fakeResource();
    water = fakeResource();
    boiler = fakeResource();
    presence = fakeResource();
    weather = fakeResource();
    blinds = fakeResource();
    lights = fakeResource();
    emptyHouse = fakeResource();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        provideRouter([]),
        {
          provide: HeatingApi,
          useValue: {
            watchStatus: () => heating,
            watchRooms: () => rooms,
            watchSensors: () => sensors,
          },
        },
        { provide: WaterApi, useValue: { watchTemperatures: () => water } },
        { provide: BoilerApi, useValue: { watchStatus: () => boiler } },
        { provide: PresenceApi, useValue: { watchNow: () => presence } },
        { provide: WeatherApi, useValue: { watchCurrent: () => weather } },
        { provide: BlindsApi, useValue: { watchBlinds: () => blinds } },
        {
          provide: LightApi,
          useValue: { watchLights: () => lights, watchEmptyHouse: () => emptyHouse },
        },
      ],
    });
    fixture = TestBed.createComponent(Overview);
  });

  afterEach(() => vi.useRealTimers());

  const page = () => fixture.nativeElement as HTMLElement;
  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function tile(name: Tile): Promise<HTMLElement> {
    await fixture.whenStable();
    return page().querySelector(`[data-testid="tile-${name}"]`) as HTMLElement;
  }

  function answerAll(): void {
    answer(heating, { isHeatingEnabled: true, updatedAt: '2026-09-28T06:45:12.840868' });
    answer(rooms, ROOMS);
    answer(sensors, SENSORS);
    answer(water, {
      measuredAt: '2026-10-10T18:28:50',
      water: { temperature: 46.81 },
      circulation: { temperature: 26.44 },
    });
    answer(boiler, BOILER);
    answer(presence, PEOPLE);
    answer(weather, WEATHER);
    answer(blinds, []);
    answer(lights, []);
    answer(emptyHouse, { house: 'occupied', enabled: true, active: false });
  }

  it('shows a progress bar in every tile until its call has answered', async () => {
    for (const name of ['heating', 'water', 'boiler', 'presence', 'weather', 'blinds'] as const) {
      expect((await tile(name)).querySelector('mat-progress-bar'), name).toBeTruthy();
    }

    answer(boiler, BOILER);

    expect((await tile('boiler')).querySelector('mat-progress-bar')).toBeNull();
    expect((await tile('water')).querySelector('mat-progress-bar')).toBeTruthy();
  });

  it('leads from every tile to the dashboard that has the rest', async () => {
    const link = async (name: Tile) =>
      (await tile(name)).querySelector('a.tile__link')?.getAttribute('href');

    expect(await link('heating')).toBe('/heating');
    expect(await link('water')).toBe('/water');
    expect(await link('boiler')).toBe('/boiler');
    expect(await link('presence')).toBe('/presence');
    expect(await link('weather')).toBe('/weather');
    expect(await link('blinds')).toBe('/blinds');
  });

  // one tile for the heating (owner, 2026-10-21, HAS-266): the state, the rooms, the silent
  // sensors - and no switch, which is on the heating page only
  describe('the heating', () => {
    it('tells the state of the system and since when, and offers no switch', async () => {
      answerAll();

      const heatingTile = await tile('heating');

      expect(words(heatingTile.querySelector('[data-testid="heating-state"]'))).toBe(
        'check_circle Enabled',
      );
      expect(words(heatingTile)).toContain('Switched on: 28 Sept 2026, 06:45');
      expect(heatingTile.querySelector('button')).toBeNull();
      expect(page().querySelector('[data-testid="heating-switch"]')).toBeNull();
    });

    it('says how many rooms there are, how many are heated, and the two extremes', async () => {
      answerAll();

      const text = words(await tile('heating'));

      expect(text).toContain('Rooms: 4');
      expect(text).toContain('Being heated now: 1');
      // each with the age of its reading: the service keeps the last one of a silent sensor
      expect(text).toMatch(/Coldest bedroom 18\.9 °C 3 min\.? ago/);
      expect(text).toMatch(/Warmest living room 21\.4 °C 2 min\.? ago/);
      expect(text).not.toContain('garden');
    });

    // right after a start of the service no relay has answered: "0 heated" would be a claim
    it('claims nothing about heating while no relay has answered', async () => {
      answerAll();
      answer(rooms, [{ name: 'living room', temperature: { value: 21 }, heaters: [{}] }]);

      expect((await tile('heating')).querySelector('[data-testid="rooms-heating"]')).toBeNull();
    });

    // a red light blinking next to the title (owner, 2026-10-21): its words for a screen reader
    it('lights a signal by the title when sensors fell silent, and names none of them', async () => {
      answerAll();

      const signal = (await tile('heating')).querySelector(
        'mat-card-title [data-testid="tile-signal"]',
      );

      expect(signal?.getAttribute('aria-label')).toBe('Silent sensors: 2 of 3.');
      expect(signal?.getAttribute('role')).toBe('img');
      expect(words(await tile('heating'))).not.toContain('muted');
    });

    it('lights no signal while every sensor reports', async () => {
      answerAll();
      answer(sensors, [SENSORS[0]]);

      expect((await tile('heating')).querySelector('[data-testid="tile-signal"]')).toBeNull();
    });

    it('says the signal in the language on screen', async () => {
      await useLanguage('pl');
      answerAll();

      expect(
        (await tile('heating'))
          .querySelector('[data-testid="tile-signal"]')
          ?.getAttribute('aria-label'),
      ).toBe('Milczące czujniki: 2 z 3.');
    });

    // the failures of the other calls are not held back by the call of the state (review of HAS-266)
    it('tells a failure of the rooms while the state of the system still loads', async () => {
      fail(rooms, new ApiError('server', 502));

      const heatingTile = await tile('heating');

      expect(heatingTile.querySelector('mat-progress-bar')).toBeTruthy();
      expect(words(heatingTile.querySelector('[role="alert"]'))).toContain('(error 502)');
    });

    it('tells a failure of the rooms or the sensors in the tile, apart from the state', async () => {
      answerAll();
      fail(sensors, new ApiError('server', 502));

      const heatingTile = await tile('heating');

      expect(heatingTile.querySelector('[role="alert"]')).toBeTruthy();
      expect(words(heatingTile.querySelector('[data-testid="heating-state"]'))).toContain(
        'Enabled',
      );
    });
  });

  describe('the hot water', () => {
    it('shows both temperatures and when the sensors were read', async () => {
      answerAll();

      const text = words(await tile('water'));

      expect(text).toContain('Tank 46.8 °C');
      expect(text).toContain('Circulation 26.4 °C');
      expect(text).toMatch(/Measured 1 min\.? ago/);
    });

    // the service repeats its last row while the sensor is silent: after two missed polls the
    // tile says so, whatever the freshness of the call
    it('calls a reading out of date once the sensor was not read for more than 6 minutes', async () => {
      answer(water, { measuredAt: '2026-10-10T18:20:00', water: { temperature: 46.81 } });

      const measured = (await tile('water')).querySelector('[data-testid="water-measured"]');

      expect(words(measured)).toMatch(
        /Measured 10 min\.? ago - the sensor has not been read since\./,
      );
      expect(measured?.classList).toContain('tile__detail--alert');
    });

    it('says nothing about the age of a reading the answer does not date', async () => {
      answer(water, { water: { temperature: 46.81 } });

      expect((await tile('water')).querySelector('[data-testid="water-measured"]')).toBeNull();
    });

    it('says that nothing was measured for a 200 without a body', async () => {
      answer(water, null);

      expect(words(await tile('water'))).toContain('No temperature has been measured yet.');
    });
  });

  describe('the boiler room', () => {
    it('says of each device what its relay reports - and nothing when it does not', async () => {
      answer(boiler, BOILER);

      const text = words(await tile('boiler'));

      expect(text).toContain('Furnace On');
      expect(text).toContain('Hot-water pump Stopped');
      // a device without `working` is not "stopped"
      expect(text).toContain('Heating pump No status yet');
    });
  });

  describe('who is at home', () => {
    it('lists every member with where the presence service last found them', async () => {
      answer(presence, PEOPLE);

      const text = words(await tile('presence'));

      expect(text).toContain('Aurelia At home');
      expect(text).toContain('Borys Away');
      // listed as not present with no check at all: never observed, which is not "away"
      expect(text).toContain('Cecylia Not observed yet');
    });

    // presence-service answers 200 with its last pass for as long as it cannot look: the
    // presence page flags a check older than five minutes, and so does the tile
    it('warns when the detection last checked more than five minutes ago', async () => {
      answer(presence, [{ name: 'Aurelia', present: true, lastCheckedAt: '2026-10-10T16:30:00' }]);

      const late = (await tile('presence')).querySelector('[data-testid="presence-late"]');

      expect(words(late)).toMatch(/Last checked 2 hr\.? ago - the detection may be down\./);
    });

    it('says nothing about the detection while its last check is fresh', async () => {
      answer(presence, PEOPLE);

      expect((await tile('presence')).querySelector('[data-testid="presence-late"]')).toBeNull();
    });

    it('says that the registry has no active member', async () => {
      answer(presence, []);

      expect(words(await tile('presence'))).toContain('No active member');
    });
  });

  // HAS-254: the blinds counted by what they report
  describe('the blinds', () => {
    const rows = async () =>
      [...(await tile('blinds')).querySelectorAll('.tile__row')].map((row) => words(row));

    it('counts the open, the closed, the moving and the not known', async () => {
      answer(blinds, [
        {
          room: 'office',
          blinds: [
            { id: 1, position: 40 },
            { id: 2, position: 0 },
            { id: 3, state: 'opening', position: 20 },
          ],
        },
        // an Eaton blind without a position: its state, and one nothing was heard of
        { room: 'living room', blinds: [{ id: 7, state: 'closed' }, { id: 8 }] },
      ]);

      expect(await rows()).toEqual(['Open 1', 'Closed 2', 'Moving 1', 'Not known 1']);
    });

    it('leaves out the moving and the not known when there are none', async () => {
      answer(blinds, [{ room: 'office', blinds: [{ id: 1, state: 'open' }] }]);

      expect(await rows()).toEqual(['Open 1', 'Closed 0']);
    });

    it('says when the service knows no blind', async () => {
      answer(blinds, []);

      expect(words(await tile('blinds'))).toContain('The blinds service knows no blind yet.');
    });
  });

  // HAS-268: the lights counted, where one is on, and the empty house - two calls in one tile
  describe('the lights', () => {
    const rows = async () =>
      [...(await tile('light')).querySelectorAll('.tile__row')].map((row) => words(row));

    it('counts the on, the off and the not known, and names the rooms with a light on', async () => {
      answer(lights, [
        {
          room: 'office',
          lights: [
            { id: 1, on: true },
            { id: 2, on: false },
          ],
        },
        { room: 'kitchen', lights: [{ id: 3, on: false }] },
        // a light nothing was heard of yet, and one on in a third room
        { room: 'hall up', lights: [{ id: 4 }, { id: 5, on: true }] },
      ]);

      expect(await rows()).toEqual(['On 2', 'Off 2', 'Not known 1']);
      expect(words((await tile('light')).querySelector('[data-testid="lit-rooms"]'))).toBe(
        'Lit in: office, hall up',
      );
    });

    it('leaves out the not known and the rooms when nothing is on', async () => {
      answer(lights, [{ room: 'office', lights: [{ id: 1, on: false }] }]);

      expect(await rows()).toEqual(['On 0', 'Off 1']);
      expect((await tile('light')).querySelector('[data-testid="lit-rooms"]')).toBeNull();
    });

    it('says when the service knows no light', async () => {
      answer(lights, []);

      expect(words(await tile('light'))).toContain('The light service knows no light.');
    });

    it('says whether the house is empty, and whether the empty house is acted on', async () => {
      answer(lights, []);
      answer(emptyHouse, { house: 'empty', enabled: true, active: true });

      const line = (await tile('light')).querySelector('[data-testid="empty-house"]')!;
      expect(words(line)).toBe('The house is empty · the empty house is acted on');
      expect(line.getAttribute('data-house')).toBe('empty');

      answer(emptyHouse, { house: 'occupied', enabled: false });
      expect(words((await tile('light')).querySelector('[data-testid="empty-house"]'))).toBe(
        'Somebody is at home · the empty house is watched only',
      );
    });

    it('does not guess the house from a word it does not know', async () => {
      answer(lights, []);
      answer(emptyHouse, { house: 'maybe' });

      expect(words((await tile('light')).querySelector('[data-testid="empty-house"]'))).toBe(
        'Whether anybody is at home is not known',
      );
    });

    it('tells a failure of the empty house in the tile, apart from the lights', async () => {
      answer(lights, [{ room: 'office', lights: [{ id: 1, on: true }] }]);
      fail(emptyHouse, new ApiError('server', 502));

      const shown = await tile('light');
      expect(words(shown.querySelector('[role="alert"]'))).toContain('(error 502)');
      expect(await rows()).toEqual(['On 1', 'Off 0']);
    });

    it('leads to the lights page', async () => {
      answerAll();

      expect((await tile('light')).querySelector('a')?.getAttribute('href')).toBe('/lights');
    });
  });

  describe('the weather', () => {
    const row = async (metric: string) =>
      words((await tile('weather')).querySelector(`[data-metric="${metric}"]`));

    it('shows the temperature, the dew point, the wind, the rain and the daylight', async () => {
      answer(weather, WEATHER);

      expect(await row('temperature')).toBe('Temperature 12.3 °C');
      expect(await row('dewPoint')).toBe('Dew point 6.1 °C');
      expect(await row('wind')).toBe('Wind 3.2 m/s gusts 5.7 m/s');
      expect(await row('raining')).toBe('Rain None');
      expect(await row('illuminance')).toBe('Daylight 21,310 lx');
      // the newest of the readings the tile shows: the wind, 40 s before now
      expect(words((await tile('weather')).querySelector('[data-testid="weather-measured"]'))).toBe(
        'Measured 40 sec ago',
      );
    });

    it('says when it rains', async () => {
      answer(weather, {
        raining: { value: true, measuredAt: '2026-10-10T18:29:00', stale: false },
      });

      expect(await row('raining')).toBe('Rain Raining');
    });

    // a metric the station was never heard of is not in the answer: nothing is drawn for it,
    // never a zero, and an unknown rain is not "no rain"
    it('draws nothing for a metric the answer leaves out', async () => {
      answer(weather, { temperature: WEATHER.temperature, gust: WEATHER.gust });

      expect(await row('temperature')).toBe('Temperature 12.3 °C');
      expect(await row('wind')).toBe('Wind gusts 5.7 m/s');
      for (const metric of ['dewPoint', 'raining', 'illuminance']) {
        expect(
          (await tile('weather')).querySelector(`[data-metric="${metric}"]`),
          metric,
        ).toBeNull();
      }
    });

    it('marks a metric the service calls stale, while the others are fresh', async () => {
      answer(weather, {
        ...WEATHER,
        illuminance: { value: 120, measuredAt: '2026-10-10T17:40:00', stale: true },
      });

      expect(await row('illuminance')).toBe('Daylight out of date 120 lx');
      expect(await row('temperature')).toBe('Temperature 12.3 °C');
    });

    it('says so once the station has not been heard of anything for a while', async () => {
      const old = { measuredAt: '2026-10-10T17:40:00', stale: true };
      answer(weather, {
        temperature: { ...old, value: 9.5 },
        raining: { ...old, value: false },
      });

      const measured = (await tile('weather')).querySelector('[data-testid="weather-measured"]');
      expect(words(measured)).toBe('Measured 50 min ago - the station has not been heard since.');
      expect(measured?.classList).toContain('tile__detail--alert');
      // told once for the whole tile, not on every row
      expect(await row('temperature')).toBe('Temperature 9.5 °C');
    });

    it('says that the station was not heard yet for an empty answer', async () => {
      answer(weather, {});

      expect(words(await tile('weather'))).toContain('No reading from the weather station yet.');
    });

    it('reads nothing into an answer that is no object, or values of another kind', async () => {
      answer(weather, {
        temperature: { value: 'warm' as unknown as number, measuredAt: 'yesterday' },
        raining: { value: 1 as unknown as boolean },
      });

      expect(words(await tile('weather'))).toContain('No reading from the weather station yet.');
      answer(weather, null);
      expect(words(await tile('weather'))).toContain('No reading from the weather station yet.');
    });
  });

  describe('when one service is down', () => {
    it('tells the failure in its tile and leaves the others as they are', async () => {
      answerAll();
      fail(boiler, new ApiError('server', 502));
      await fixture.whenStable();

      expect((await tile('boiler')).querySelector('[role="alert"]')).toBeTruthy();
      expect(words(await tile('boiler'))).toContain('Furnace On');
      for (const name of ['heating', 'water', 'presence'] as const) {
        expect((await tile(name)).querySelector('[role="alert"]'), name).toBeNull();
      }
      expect(words(await tile('water'))).toContain('46.8 °C');
    });

    it('says why a tile is empty when its service never answered', async () => {
      answerAll();
      presence.value.set(undefined);
      fail(presence, new ApiError('network', 0));

      const text = words(await tile('presence'));

      expect(text).toContain('cannot be reached');
      // a failure is not an empty household
      expect(text).not.toContain('No active member');
    });
  });

  it('speaks Polish, with a decimal comma', async () => {
    await useLanguage('pl');
    answerAll();

    expect(words(await tile('water'))).toContain('Zasobnik 46,8 °C');
    expect(words(page().querySelector('h1'))).toBe('Przegląd');
    expect(words(await tile('heating'))).toContain('Najchłodniejszy bedroom 18,9 °C');
    expect(words(await tile('presence'))).toContain('Aurelia W domu');
    expect(words(await tile('weather'))).toContain('Wiatr 3,2 m/s porywy 5,7 m/s');
  });
});
