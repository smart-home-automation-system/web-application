import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { FakeResource, answer, fail, fakeResource } from '../../../testing/fake-resource';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { BoilerApi, BoilerStatus } from '../../data-access/boiler/boiler-api';
import {
  HeatingApi,
  HeatingStatus,
  Room,
  TemperatureSensor,
} from '../../data-access/heating/heating-api';
import { PresenceApi, ResidentPresence } from '../../data-access/presence/presence-api';
import { WaterApi, WaterTemperatures } from '../../data-access/water/water-api';
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

type Tile = 'rooms' | 'sensors' | 'water' | 'boiler' | 'presence';

describe('Overview', () => {
  let heating: FakeResource<HeatingStatus>;
  let rooms: FakeResource<readonly Room[] | null>;
  let sensors: FakeResource<readonly TemperatureSensor[] | null>;
  let water: FakeResource<WaterTemperatures | null>;
  let boiler: FakeResource<BoilerStatus>;
  let presence: FakeResource<readonly ResidentPresence[] | null>;
  let turned: boolean[];
  let fixture: ComponentFixture<Overview>;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    heating = fakeResource();
    rooms = fakeResource();
    sensors = fakeResource();
    water = fakeResource();
    boiler = fakeResource();
    presence = fakeResource();
    turned = [];
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        provideRouter([]),
        {
          provide: HeatingApi,
          useValue: {
            watchSwitch: () => ({
              ...heating,
              switching: signal(false),
              switchFailure: signal(undefined),
              turn: (on: boolean) => turned.push(on),
            }),
            watchRooms: () => rooms,
            watchSensors: () => sensors,
          },
        },
        { provide: WaterApi, useValue: { watchTemperatures: () => water } },
        { provide: BoilerApi, useValue: { watchStatus: () => boiler } },
        { provide: PresenceApi, useValue: { watchNow: () => presence } },
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
  }

  it('shows a progress bar in every tile until its call has answered', async () => {
    for (const name of ['rooms', 'sensors', 'water', 'boiler', 'presence'] as const) {
      expect((await tile(name)).querySelector('mat-progress-bar'), name).toBeTruthy();
    }

    answer(boiler, BOILER);

    expect((await tile('boiler')).querySelector('mat-progress-bar')).toBeNull();
    expect((await tile('water')).querySelector('mat-progress-bar')).toBeTruthy();
  });

  it('leads from every tile to the dashboard that has the rest', async () => {
    const link = async (name: Tile) =>
      (await tile(name)).querySelector('a.tile__link')?.getAttribute('href');

    expect(await link('rooms')).toBe('/heating');
    expect(await link('sensors')).toBe('/heating');
    expect(await link('water')).toBe('/water');
    expect(await link('boiler')).toBe('/boiler');
    expect(await link('presence')).toBe('/presence');
  });

  describe('the heating of the house', () => {
    it('is the card of the heating page, with its state and its switch', async () => {
      answerAll();
      await fixture.whenStable();

      const card = page().querySelector('[data-testid="heating-switch"]');
      expect(words(card?.querySelector('[data-testid="heating-state"]'))).toContain('Enabled');
      expect(words(card)).toContain('Switched on: 28 Sept 2026, 06:45');
    });

    // the one control of the page that changes the house: never without the question first
    it('asks before it switches', async () => {
      answerAll();
      await fixture.whenStable();
      const card = page().querySelector('[data-testid="heating-switch"]') as HTMLElement;

      (card.querySelector('.switch__trigger') as HTMLButtonElement).click();
      await fixture.whenStable();

      expect(turned).toEqual([]);
      expect(words(card)).toContain('Cancel');
    });
  });

  describe('the rooms', () => {
    it('says how many there are, how many are heated, and the two extremes', async () => {
      answer(rooms, ROOMS);

      const text = words(await tile('rooms'));

      expect(text).toContain('Rooms: 3');
      expect(text).toContain('Being heated now: 1');
      expect(text).toContain('Coldest bedroom 18.9 °C');
      expect(text).toContain('Warmest living room 21.4 °C');
    });

    // right after a start of the service no relay has answered: "0 heated" would be a claim
    it('claims nothing about heating while no relay has answered', async () => {
      answer(rooms, [{ name: 'living room', temperature: { value: 21 }, heaters: [{}] }]);

      expect((await tile('rooms')).querySelector('[data-testid="rooms-heating"]')).toBeNull();
    });

    it('says that no room has a reading yet', async () => {
      answer(rooms, [{ name: 'living room', heaters: [] }]);

      expect(words(await tile('rooms'))).toContain('No room has a reading yet.');
    });

    it('does not read an answer that is no list as a house without rooms', async () => {
      answer(rooms, null);

      expect(words(await tile('rooms'))).toContain('The service did not answer with a list');
    });
  });

  describe('the temperature sensors', () => {
    it('names the sensors that fell silent, with how long ago each last reported', async () => {
      answer(sensors, SENSORS);

      const text = words(await tile('sensors'));

      expect(text).toContain('Silent sensors: 2 of 3.');
      expect(text).toMatch(/bathroom down 3 days ago/);
      expect(text).toMatch(/sauna muted \d+ days ago/);
      expect(text).not.toContain('living room');
    });

    it('says that all report when every sensor is known to', async () => {
      answer(sensors, [SENSORS[0]]);

      const text = words(await tile('sensors'));

      expect(text).toContain('All sensors are reporting (1).');
      expect((await tile('sensors')).querySelector('[data-testid="sensors-silent"]')).toBeNull();
    });

    // a sensor whose `stale` is no flag is neither reporting nor silent
    it('does not call sensors reporting when the answer does not say', async () => {
      answer(sensors, [{ room: 'living room', lastReadingAt: '2026-10-10T18:28:00' }]);

      const text = words(await tile('sensors'));

      expect(text).toContain('The service does not say which sensors are reporting.');
      expect(text).not.toContain('All sensors');
    });

    it('says that no sensor has reported yet', async () => {
      answer(sensors, []);

      expect(words(await tile('sensors'))).toContain('No sensor has reported yet.');
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

    it('says that the registry has no active member', async () => {
      answer(presence, []);

      expect(words(await tile('presence'))).toContain('No active member');
    });
  });

  describe('when one service is down', () => {
    it('tells the failure in its tile and leaves the others as they are', async () => {
      answerAll();
      fail(boiler, new ApiError('server', 502));
      await fixture.whenStable();

      expect((await tile('boiler')).querySelector('[role="alert"]')).toBeTruthy();
      expect(words(await tile('boiler'))).toContain('Furnace On');
      for (const name of ['rooms', 'sensors', 'water', 'presence'] as const) {
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
    expect(words(await tile('rooms'))).toContain('Najchłodniejszy bedroom 18,9 °C');
    expect(words(await tile('presence'))).toContain('Aurelia W domu');
  });
});
