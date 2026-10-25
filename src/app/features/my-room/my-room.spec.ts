import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FakeResource, answer, fail, fakeResource } from '../../../testing/fake-resource';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { Profile } from '../../core/profile/profile';
import { ProfileStore } from '../../core/profile/profile-store';
import { of } from 'rxjs';

import { Appliance, FailedAcknowledgement } from '../../data-access/appliance/appliance-api';
import { ApplianceStore } from '../../data-access/appliance/appliance-store';
import { BlindsApi, RoomBlinds } from '../../data-access/blinds/blinds-api';
import { DeviceRegistryApi, SmartDevice } from '../../data-access/devices/device-registry-api';
import { HeatingApi, HeatingStatus, Room } from '../../data-access/heating/heating-api';
import { LightApi, RoomLights, RoomRule } from '../../data-access/light/light-api';
import { MyRoom } from './my-room';

/** Thursday 8 October 2026, 14:30:00 on the clocks of the house (Europe/Warsaw, summer time). */
const NOW = Date.parse('2026-10-08T12:30:00Z');

const EVERY_DAY = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

const BEDROOM: Room = {
  name: 'bedroom',
  heatingEnabled: true,
  temperature: { value: 19.6, updatedAt: '2026-10-08T14:27:00.817456' },
  humidity: { value: 46.4, updatedAt: '2026-10-08T14:27:00.817456' },
  heaters: [
    {
      type: 'radiator',
      working: true,
      updatedAt: '2026-10-08T14:28:00.926456',
      inSchedule: true,
      targetTemperature: 21,
      scheduledTemperature: 21,
      schedules: [
        {
          type: 'HEATING',
          days: EVERY_DAY,
          startTime: '05:30:00',
          endTime: '07:00:00',
          temperature: 19,
        },
        {
          type: 'HEATING',
          days: ['THURSDAY'],
          startTime: '13:00:00',
          endTime: '22:00:00',
          temperature: 21,
        },
        {
          type: 'HEATING',
          days: ['SATURDAY'],
          startTime: '09:00:00',
          endTime: '10:00:00',
          temperature: 23,
        },
      ],
    },
  ],
};

/** As the service answers right after a start: a restored temperature and nothing decided. */
const WARDROBE: Room = {
  name: 'wardrobe',
  temperature: { value: 20.9, updatedAt: '2026-10-08T14:10:00.935275' },
  heaters: [{ type: 'floor', schedules: [] }],
};

const resident = (...rooms: string[]): Profile => ({ name: 'Celina', role: 'resident', rooms });

describe('MyRoom', () => {
  let profile: WritableSignal<Profile | undefined>;
  let status: FakeResource<HeatingStatus>;
  /** A resource per room asked for, in the order the cards were made. */
  let asked: { name: () => string; resource: FakeResource<Room | null> }[];
  let turned: boolean[];
  /** How many times the page asked for the switch of the house. */
  let switchesWatched: number;
  let fixture: ComponentFixture<MyRoom> | undefined;
  /** The blinds (HAS-254) and the sensors of the registry asked for, per room, in order. */
  let blindsAsked: { name: () => string; resource: FakeResource<RoomBlinds | null> }[];
  let sensorsAsked: { name: () => string; resource: FakeResource<readonly SmartDevice[] | null> }[];
  /** The lights of the room and its rule (HAS-268) asked for, per room, in order. */
  let lightsAsked: { name: () => string; resource: FakeResource<RoomLights | null> }[];
  let rulesAsked: { name: () => string; resource: FakeResource<RoomRule | null> }[];
  /** The commands sent to the blinds, in words. */
  let sent: string[];
  let appliances: FakeResource<readonly Appliance[] | null>;
  let acknowledged: number[];
  const acknowledgeFailure = signal<FailedAcknowledgement | undefined>(undefined);

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    profile = signal<Profile | undefined>(resident('bedroom'));
    status = fakeResource();
    asked = [];
    turned = [];
    switchesWatched = 0;
    fixture = undefined;
    blindsAsked = [];
    sensorsAsked = [];
    lightsAsked = [];
    rulesAsked = [];
    sent = [];
    appliances = fakeResource();
    acknowledged = [];
    acknowledgeFailure.set(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: ProfileStore, useValue: { profile } },
        {
          provide: HeatingApi,
          useValue: {
            watchSwitch: () => {
              switchesWatched++;
              return {
                ...status,
                switching: signal(false),
                switchFailure: signal(undefined),
                turn: (on: boolean) => turned.push(on),
              };
            },
            watchRoom: (name: () => string) => {
              const resource = fakeResource<Room | null>();
              asked.push({ name, resource });
              return resource;
            },
          },
        },
        {
          provide: BlindsApi,
          useValue: {
            watchRoom: (name: () => string) => {
              const resource = fakeResource<RoomBlinds | null>();
              blindsAsked.push({ name, resource });
              return resource;
            },
            move: (id: number, command: string) => {
              sent.push(`${command} ${id}`);
              return of(undefined);
            },
            moveTo: (id: number, position: number) => {
              sent.push(`to ${position} ${id}`);
              return of(undefined);
            },
            pauseSchedules: (id: number) => {
              sent.push(`pause ${id}`);
              return of(undefined);
            },
            resumeSchedules: (id: number) => {
              sent.push(`resume ${id}`);
              return of(undefined);
            },
          },
        },
        {
          provide: LightApi,
          useValue: {
            watchRoom: (name: () => string) => {
              const resource = fakeResource<RoomLights | null>();
              lightsAsked.push({ name, resource });
              return resource;
            },
            watchRoomRule: (name: () => string) => {
              const resource = fakeResource<RoomRule | null>();
              rulesAsked.push({ name, resource });
              return resource;
            },
            turn: (id: number, on: boolean) => {
              sent.push(`light ${on ? 'on' : 'off'} ${id}`);
              return of(undefined);
            },
            brightness: (id: number, value: number) => {
              sent.push(`brightness ${value} ${id}`);
              return of(undefined);
            },
            color: (id: number, color: { rgb: number[]; white?: number }) => {
              sent.push(
                `color ${color.rgb.join('/')}${color.white === undefined ? '' : ' white ' + color.white} ${id}`,
              );
              return of(undefined);
            },
            roomTurn: (room: string, on: boolean) => {
              sent.push(`room ${on ? 'on' : 'off'} ${room}`);
              return of({ room, turn: on ? 'on' : 'off', switched: [], failed: [] });
            },
            residentEnabled: (room: string, enabled: boolean) => {
              sent.push(`resident ${enabled ? 'on' : 'off'} ${room}`);
              return of(null);
            },
          },
        },
        {
          provide: ApplianceStore,
          useFactory: () => ({
            appliances: {
              ...appliances,
              acknowledging: signal(undefined),
              acknowledgeFailure,
              acknowledge: (id: number) => acknowledged.push(id),
            },
          }),
        },
        {
          provide: DeviceRegistryApi,
          useValue: {
            watchRoom: (name: () => string) => {
              const resource = fakeResource<readonly SmartDevice[] | null>();
              sensorsAsked.push({ name, resource });
              return resource;
            },
          },
        },
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function page(): Promise<HTMLElement> {
    fixture ??= TestBed.createComponent(MyRoom);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  async function card(): Promise<HTMLElement | null> {
    return (await page()).querySelector('[data-testid="room-heating"]');
  }

  async function switcher(): Promise<HTMLElement | null> {
    return (await page()).querySelector('[data-testid="room-switcher"]');
  }

  /** The room the newest card asks the service for. */
  const lastAsked = () => asked.at(-1)!;

  describe('for a member with one room', () => {
    it('asks for that room and offers no switcher', async () => {
      await page();

      expect(asked.map((entry) => entry.name())).toEqual(['bedroom']);
      expect(await switcher()).toBeNull();
      expect((await card())!.querySelector('mat-progress-bar')).toBeTruthy();
    });

    it('shows the temperature with its age, the humidity, the target and the heater', async () => {
      await page();
      answer(lastAsked().resource, BEDROOM);

      const shown = words(await card());

      expect(shown).toContain('bedroom');
      expect(shown).toContain('19.6 °C');
      expect(shown).toContain('Measured 3 min ago');
      expect(shown).toContain('Humidity 46 %');
      expect(shown).toContain('Target 21 °C');
      expect(shown).toContain('Radiator: heating Calls for heat');
      expect(shown).toContain('Reported 2 min ago');
    });

    // the week of the heater has three periods; only those of this Thursday are on the page
    it('shows the schedule of today alone, by the clock of the house', async () => {
      await page();
      answer(lastAsked().resource, BEDROOM);

      const rows = [...(await card())!.querySelectorAll('.week__day')].map(words);

      expect(rows).toEqual(['Thu (today) 05:30–07:00 · 19 °C 13:00–22:00 · 21 °C']);
      expect((await card())!.querySelectorAll('.week__period')).toHaveLength(2);
      expect((await card())!.querySelectorAll('.week__now')).toHaveLength(1);
    });

    it('leaves the humidity out when the service reports none', async () => {
      await page();
      answer(lastAsked().resource, WARDROBE);

      expect((await card())!.querySelector('[data-testid="room-humidity"]')).toBeNull();
    });

    // right after a start of the service: nothing was decided, so nothing is claimed
    it('says "no status yet" for a heater the service has not heard from, never "off"', async () => {
      await page();
      answer(lastAsked().resource, WARDROBE);

      const shown = words(await card());

      expect(shown).toContain('20.9 °C');
      expect(shown).toContain('Target No schedule right now');
      expect(shown).toContain('Floor heating: no status yet');
      expect(shown).toContain('No schedule.');
      expect(shown).not.toContain(': off');
      expect(shown).not.toContain('Calls for heat');
      expect(shown).not.toContain('Reported');
    });

    it('says that a room has not reported, and that it has no heater', async () => {
      await page();
      answer(lastAsked().resource, { name: 'bedroom', heaters: [] });

      const shown = words(await card());

      expect(shown).toContain('No reading yet');
      expect(shown).toContain('No heater');
      expect(shown).not.toContain('°C');
      expect(shown).not.toContain('Target');
    });

    // the registry names the rooms of a member; the heating service may not have one of them
    it('says that the heating service does not know the room, without calling it a failure', async () => {
      await page();
      fail(
        lastAsked().resource,
        new ApiError('client', 404, [
          { message: 'Room with provided name is not a part of home', code: 'NOT_FOUND_ROOM' },
        ]),
      );

      const shown = await card();

      expect(words(shown)).toContain('The heating service does not know this room');
      expect(shown!.querySelector('[role="alert"]')).toBeNull();
    });

    // the resource keeps its last answer over a failure: a room that is gone since must not go
    // on showing its last temperature without a word of why
    it('says that the room is unknown also after it was answered before', async () => {
      await page();
      answer(lastAsked().resource, BEDROOM);
      fail(
        lastAsked().resource,
        new ApiError('client', 404, [
          { message: 'Room with provided name is not a part of home', code: 'NOT_FOUND_ROOM' },
        ]),
      );

      const shown = await card();

      expect(words(shown)).toContain('The heating service does not know this room');
      expect(words(shown)).not.toContain('19.6');
    });

    it('draws no empty list of facts for a room with nothing to tell', async () => {
      await page();
      answer(lastAsked().resource, { name: 'bedroom', heaters: [] });

      expect((await card())!.querySelector('dl')).toBeNull();
    });

    // a 404 without the code is a route that is not there: a failure like any other
    it('tells a 404 without the code as a failure', async () => {
      await page();
      fail(lastAsked().resource, new ApiError('client', 404, [{ message: 'No static resource' }]));

      const shown = await card();

      expect(shown!.querySelector('[role="alert"]')).toBeTruthy();
      expect(words(shown)).not.toContain('does not know this room');
    });

    it('keeps the last answer on screen next to the failure of the next call', async () => {
      await page();
      answer(lastAsked().resource, BEDROOM);
      fail(lastAsked().resource, new ApiError('server', 502));

      const shown = await card();

      expect(words(shown)).toContain('19.6 °C');
      expect(words(shown!.querySelector('[role="alert"]'))).toContain(
        'The service is not available right now (error 502).',
      );
    });

    it.each([
      ['no body', null],
      ['an answer without a name', {} as Room],
    ])('says that the service did not answer with the room for %s', async (_, value) => {
      await page();
      answer(lastAsked().resource, value);

      expect(words(await card())).toContain('The heating service did not answer with the room.');
    });
  });

  describe('for a member with two rooms', () => {
    beforeEach(() => profile.set(resident('bedroom', 'wardrobe')));

    const options = async () =>
      [...(await switcher())!.querySelectorAll('button')].map((button) => [
        words(button),
        button.getAttribute('aria-checked') ?? button.getAttribute('aria-pressed'),
      ]);

    async function choose(room: string): Promise<void> {
      [...(await switcher())!.querySelectorAll('button')]
        .find((button) => words(button) === room)!
        .click();
      await page();
    }

    it('offers the rooms and starts with the first', async () => {
      expect(await options()).toEqual([
        ['bedroom', 'true'],
        ['wardrobe', 'false'],
      ]);
      expect(asked.map((entry) => entry.name())).toEqual(['bedroom']);
    });

    // a card made anew: what was answered for one room never stands under the name of another
    it('shows the other room in a card of its own, with nothing of the first', async () => {
      await page();
      answer(lastAsked().resource, BEDROOM);

      await choose('wardrobe');

      expect(asked.map((entry) => entry.name())).toEqual(['bedroom', 'wardrobe']);
      const waiting = await card();
      expect(words(waiting)).toContain('wardrobe');
      expect(words(waiting)).not.toContain('19.6');
      expect(waiting!.querySelector('mat-progress-bar')).toBeTruthy();

      answer(lastAsked().resource, WARDROBE);

      expect(words(await card())).toContain('20.9 °C');
      expect((await page()).querySelectorAll('[data-testid="room-heating"]')).toHaveLength(1);
    });

    it('goes back to the first room when the registry takes the chosen one away', async () => {
      await choose('wardrobe');

      profile.set(resident('bedroom'));

      expect(await switcher()).toBeNull();
      expect(lastAsked().name()).toBe('bedroom');
      expect(words(await card())).toContain('bedroom');

      // given back, the room does not take the page over again by itself
      profile.set(resident('bedroom', 'wardrobe'));

      expect(await options()).toEqual([
        ['bedroom', 'true'],
        ['wardrobe', 'false'],
      ]);
      expect(words(await card())).toContain('bedroom');
    });

    it('lists a room the registry names twice once', async () => {
      profile.set(resident('bedroom', 'wardrobe', 'bedroom'));

      expect((await options()).map(([name]) => name)).toEqual(['bedroom', 'wardrobe']);
    });
  });

  describe('for a member without a room', () => {
    beforeEach(() => profile.set(resident()));

    it('says so and asks for no room', async () => {
      const shown = await page();

      expect(words(shown.querySelector('[data-testid="no-rooms"]'))).toContain(
        'No room is assigned to your profile yet.',
      );
      expect(asked).toEqual([]);
      expect(await card()).toBeNull();
      expect(shown.querySelector('[data-testid="heating-switch"]')).toBeNull();
    });

    it('shows the room as soon as the registry assigns one', async () => {
      await page();

      profile.set(resident('wardrobe'));

      expect((await page()).querySelector('[data-testid="no-rooms"]')).toBeNull();
      expect(lastAsked().name()).toBe('wardrobe');
    });
  });

  /** Every control of the page, in words: those inside the card of the room, and the rest. */
  async function controls(): Promise<{ inTheRoom: string[]; elsewhere: string[] }> {
    const all = [
      ...(await page()).querySelectorAll('button, a, input, select, textarea, [tabindex]'),
    ];
    const inRoom = (control: Element) => control.closest('[data-testid="room-heating"]') !== null;
    return {
      inTheRoom: all.filter(inRoom).map(words),
      elsewhere: all.filter((control) => !inRoom(control)).map(words),
    };
  }

  // residents view temperatures and schedules; setting them is the administrator's alone - and
  // the switch of the whole house is on this page only for a member the registry lets have it
  describe('what can be pressed', () => {
    it('is nothing but the choice of the room', async () => {
      profile.set(resident('bedroom', 'wardrobe'));
      await page();
      answer(lastAsked().resource, BEDROOM);

      expect(await controls()).toEqual({ inTheRoom: [], elsewhere: ['bedroom', 'wardrobe'] });
    });

    it('is nothing at all for a member with one room', async () => {
      await page();
      answer(lastAsked().resource, BEDROOM);
      // a room without blinds and with a sensor: the sensors are listed, nothing more to press
      answer(blindsAsked.at(-1)!.resource, { room: 'bedroom', blinds: [] });
      answer(sensorsAsked.at(-1)!.resource, [
        { id: 1, name: 'Bedroom motion', room: 'bedroom', kind: 'motion sensor' },
      ]);
      expect((await page()).querySelector('[data-testid="room-sensors"]')).not.toBeNull();

      expect(await controls()).toEqual({ inTheRoom: [], elsewhere: [] });
    });

    it('offers no switch of the house, and does not ask for its state', async () => {
      const shown = await page();

      expect(shown.querySelector('[data-testid="heating-switch"]')).toBeNull();
      expect(switchesWatched).toBe(0);
    });

    // not the role decides: an administrator switches the heating on its dashboard
    it('offers the administrator no switch here either', async () => {
      profile.set({ name: 'Aurelia', role: 'admin', rooms: ['bedroom'] });

      expect((await page()).querySelector('[data-testid="heating-switch"]')).toBeNull();
      expect(switchesWatched).toBe(0);
    });

    it('ignores a permission it does not know', async () => {
      profile.set({ ...resident('bedroom'), permissions: ['everything'] });

      expect((await page()).querySelector('[data-testid="heating-switch"]')).toBeNull();
    });
  });

  describe('for a member the registry lets switch the heating', () => {
    const granted = (...rooms: string[]): Profile => ({
      ...resident(...rooms),
      permissions: ['heating_switch'],
    });

    beforeEach(() => profile.set(granted('bedroom', 'wardrobe')));

    it('shows the switch of the house, the card shared with the heating dashboard', async () => {
      await page();
      answer(status, { isHeatingEnabled: false, updatedAt: '2026-09-28T06:45:12.840868' });

      expect(words((await page()).querySelector('[data-testid="heating-switch"]'))).toContain(
        'Disabled',
      );
      expect(switchesWatched).toBe(1);
    });

    it('adds that one control to the page, and still none to the room', async () => {
      await page();
      answer(lastAsked().resource, BEDROOM);
      answer(status, { isHeatingEnabled: true, updatedAt: '2026-09-28T06:45:12.840868' });

      expect(await controls()).toEqual({
        inTheRoom: [],
        elsewhere: ['bedroom', 'wardrobe', 'power_settings_new Switch off'],
      });
    });

    it('keeps the switch while the member has no room', async () => {
      profile.set(granted());

      const shown = await page();

      expect(shown.querySelector('[data-testid="no-rooms"]')).toBeTruthy();
      expect(shown.querySelector('[data-testid="heating-switch"]')).toBeTruthy();
    });

    // the registry is asked again under an open page: a permission taken away there goes here
    it('takes the switch away as soon as the registry does, and gives it back', async () => {
      await page();

      profile.set(resident('bedroom', 'wardrobe'));
      expect((await page()).querySelector('[data-testid="heating-switch"]')).toBeNull();

      profile.set(granted('bedroom', 'wardrobe'));
      expect((await page()).querySelector('[data-testid="heating-switch"]')).toBeTruthy();
      expect(switchesWatched).toBe(2);
    });
  });

  it('speaks Polish, except for the identifiers of the rooms', async () => {
    profile.set(resident('bedroom', 'wardrobe'));
    await page();
    answer(lastAsked().resource, BEDROOM);
    await useLanguage('pl');

    const shown = words(await page());

    expect(shown).toContain('Mój pokój');
    expect(shown).toContain('bedroom');
    expect(shown).toContain('19,6 °C');
    expect(shown).toContain('Wilgotność 46 %');
    expect(shown).toContain('Cel 21 °C');
    expect(shown).toContain('Grzejnik: grzeje Wymaga grzania');
    expect(shown).toContain('Harmonogram na dziś');
    expect(shown).toContain('czw. (dzisiaj) 05:30–07:00 · 19 °C');
  });

  // HAS-254: the blinds of the room - the one card of the page with controls - its sensors, and
  // the windows on the heating card
  describe('the blinds of the room', () => {
    const BLINDS: RoomBlinds = {
      room: 'bedroom',
      blinds: [
        { id: 4, name: 'Bedroom window blinds', positioning: true, position: 40 },
        { id: 3, name: 'Bedroom door blinds', positioning: false, state: 'closed' },
      ],
    };

    const card = async () => (await page()).querySelector('[data-testid="room-blinds"]');
    const lastBlinds = () => blindsAsked.at(-1)!;

    it('lists them for the room on screen, the door first, each without the room', async () => {
      await page();
      expect(lastBlinds().name()).toBe('bedroom');
      answer(lastBlinds().resource, BLINDS);

      const names = [...(await card())!.querySelectorAll('.blind__name')].map(words);
      expect(names).toEqual(['Door', 'Window']);
      expect(
        words((await card())!.querySelector('[data-blind="4"] [data-testid="blind-position"]')),
      ).toBe('40 %');
    });

    it('names exactly the controls of the blinds and their pause as what can be pressed', async () => {
      await page();
      answer(lastAsked().resource, BEDROOM);
      answer(lastBlinds().resource, BLINDS);

      const inCard = [...(await card())!.querySelectorAll('button, a, input, [tabindex]')].map(
        // a switch is named by its label
        (control) =>
          control.getAttribute('role') === 'switch'
            ? 'switch: ' + words(control.closest('mat-slide-toggle'))
            : words(control),
      );
      expect(inCard).toEqual([
        'arrow_upward Open Bedroom door blinds',
        'stop Stop Bedroom door blinds',
        'arrow_downward Close Bedroom door blinds',
        'switch: Pause the schedules until their next run Bedroom door blinds',
        'arrow_upward Open Bedroom window blinds',
        'stop Stop Bedroom window blinds',
        'arrow_downward Close Bedroom window blinds',
        '',
        'Go Bedroom window blinds',
        'switch: Pause the schedules until their next run Bedroom window blinds',
      ]);
      // nothing in the card of the heating
      expect((await controls()).inTheRoom).toEqual([]);
    });

    it('sends a command and reads the room again - nothing optimistic', async () => {
      await page();
      answer(lastBlinds().resource, BLINDS);
      const refreshed = vi.spyOn(lastBlinds().resource, 'refresh');

      const close = [...(await card())!.querySelectorAll('button')].find(
        (button) => words(button) === 'arrow_downward Close Bedroom window blinds',
      )!;
      close.click();
      await page();

      expect(sent).toEqual(['close 4']);
      expect(refreshed).toHaveBeenCalled();
    });

    it('shows no card for a room without blinds, nor while the first answer is on its way', async () => {
      await page();
      expect(await card()).toBeNull();

      answer(lastBlinds().resource, { room: 'bedroom', blinds: [] });
      expect(await card()).toBeNull();
    });

    // what blinds-service answers for a room without blinds (found on the live page, 2026-10-18)
    it('shows no card for the 404 of a room without blinds, also after an answer with some', async () => {
      await page();
      answer(lastBlinds().resource, BLINDS);
      expect(await card()).not.toBeNull();

      fail(
        lastBlinds().resource,
        new ApiError('client', 404, [{ message: 'Blinds not found', code: 'NOT_FOUND_BLINDS' }]),
      );
      expect(await card()).toBeNull();
    });

    it('still tells a 404 without the code of the service', async () => {
      await page();
      fail(lastBlinds().resource, new ApiError('client', 404, [{ message: 'Not Found' }]));

      expect(await card()).not.toBeNull();
    });

    it('tells a failure before any answer: nobody knows then whether the room has blinds', async () => {
      await page();
      fail(lastBlinds().resource, new ApiError('server', 503));

      expect(words(await card())).toContain('The service is not available right now');
    });
  });

  describe('the lights of the room', () => {
    const LIGHTS: RoomLights = {
      room: 'bedroom',
      anyOn: true,
      lights: [
        {
          id: 13,
          name: 'Bedroom light strip',
          kind: 'rgbw',
          on: true,
          brightness: 60,
          color: { rgb: [255, 120, 0] },
        },
        {
          id: 12,
          name: 'Bedroom ceiling light',
          kind: 'relay',
          on: false,
          changedAt: '2026-10-08T14:20:00',
        },
      ],
      occupancy: { room: 'bedroom', occupied: true, lastMotionAt: '2026-10-08T14:29:00', lux: 39 },
    };
    const RULE: RoomRule = {
      room: 'bedroom',
      autoOffEnabled: true,
      autoOffDelayMinutes: 15,
      motionOnEnabled: false,
      manualHoldMinutes: 60,
      enabledByResident: true,
    };

    const card = async () => (await page()).querySelector('[data-testid="room-lights"]');
    const lastLights = () => lightsAsked.at(-1)!;
    const lastRule = () => rulesAsked.at(-1)!;

    it('lists them for the room on screen, by name and without the room, with the occupancy', async () => {
      await page();
      expect(lastLights().name()).toBe('bedroom');
      expect(lastRule().name()).toBe('bedroom');
      answer(lastLights().resource, LIGHTS);

      const names = [...(await card())!.querySelectorAll('.light__name')].map(words);
      expect(names).toEqual(['Ceiling', 'Light strip']);
      expect(words((await card())!.querySelector('[data-testid="occupancy"]'))).toBe(
        'person Occupied · motion 1 min ago · 39 lx',
      );
      expect(
        words((await card())!.querySelector('[data-light="13"] [data-testid="light-state"]')),
      ).toBe('on · 60 %');
      // the strip has colour sliders and no white; the ceiling light has neither
      expect(
        (await card())!.querySelectorAll('[data-light="13"] [data-testid^="color-"]'),
      ).toHaveLength(3);
      expect(
        (await card())!.querySelector('[data-light="12"] [data-testid="brightness"]'),
      ).toBeNull();
    });

    it('sends a command and reads the room again - nothing optimistic', async () => {
      await page();
      answer(lastLights().resource, LIGHTS);
      const refreshed = vi.spyOn(lastLights().resource, 'refresh');

      (await card())!
        .querySelector<HTMLButtonElement>('[data-light="12"] [data-testid="light-on"]')!
        .click();
      await page();

      expect(sent).toEqual(['light on 12']);
      expect(refreshed).toHaveBeenCalled();
    });

    it('switches the room off at once and reads it again', async () => {
      await page();
      answer(lastLights().resource, LIGHTS);
      const refreshed = vi.spyOn(lastLights().resource, 'refresh');

      (await card())!.querySelector<HTMLButtonElement>('[data-testid="room-off"]')!.click();
      await page();

      expect(sent).toEqual(['room off bedroom']);
      expect(refreshed).toHaveBeenCalled();
    });

    it('shows the rule in a few words with the switch of the resident, which reads the rule back', async () => {
      await page();
      answer(lastLights().resource, LIGHTS);
      answer(lastRule().resource, RULE);
      const refreshed = vi.spyOn(lastRule().resource, 'refresh');

      expect(words((await card())!.querySelector('.rule__text'))).toBe(
        'off 15 min after empty · by hand left 60 min',
      );
      const toggle = (await card())!.querySelector<HTMLElement>(
        '[data-testid="rule-switch"] [role="switch"]',
      )!;
      expect(toggle.getAttribute('aria-checked')).toBe('true');

      toggle.click();
      await page();

      expect(sent).toEqual(['resident off bedroom']);
      expect(refreshed).toHaveBeenCalled();
      // the switch shows what the service stores, not what was clicked
      expect(toggle.getAttribute('aria-checked')).toBe('true');
      answer(lastRule().resource, { ...RULE, enabledByResident: false });
      expect(
        (await card())!
          .querySelector('[data-testid="rule-switch"] [role="switch"]')!
          .getAttribute('aria-checked'),
      ).toBe('false');
    });

    // missing is never read as on or off: a rule without the field gets no switch to flip
    it('offers no switch for a rule the service answers without enabledByResident', async () => {
      await page();
      answer(lastLights().resource, LIGHTS);
      answer(lastRule().resource, { ...RULE, enabledByResident: undefined });

      expect((await card())!.querySelector('[data-testid="rule-switch"]')).toBeNull();
      expect(words((await card())!.querySelector('[data-testid="rule-switch-unknown"]'))).toBe(
        'Automatic lighting of the room: not known',
      );
    });

    it('says that the room has no rule, and offers no switch - the 404 of the service is no failure', async () => {
      await page();
      answer(lastLights().resource, LIGHTS);
      fail(
        lastRule().resource,
        new ApiError('client', 404, [{ message: 'Rule not found', code: 'NOT_FOUND_RULE' }]),
      );

      expect(words((await card())!.querySelector('.rule__text'))).toBe('No rule');
      expect((await card())!.querySelector('[data-testid="rule-switch"]')).toBeNull();
      expect((await card())!.querySelector('[role="alert"]')).toBeNull();
    });

    it('shows no card for a room without lights, nor while the first answer is on its way', async () => {
      await page();
      expect(await card()).toBeNull();

      answer(lastLights().resource, { room: 'bedroom', lights: [] });
      expect(await card()).toBeNull();
    });

    it('shows no card for the 404 of a room without lights, also after an answer with some', async () => {
      await page();
      answer(lastLights().resource, LIGHTS);
      expect(await card()).not.toBeNull();

      fail(
        lastLights().resource,
        new ApiError('client', 404, [{ message: 'No light in room', code: 'NOT_FOUND_LIGHT' }]),
      );
      expect(await card()).toBeNull();
    });

    it('tells a failure before any answer: nobody knows then whether the room has lights', async () => {
      await page();
      fail(lastLights().resource, new ApiError('server', 503));

      expect(words(await card())).toContain('The service is not available right now');
    });
  });

  describe('the sensors of the room', () => {
    const sensors = async () => (await page()).querySelector('[data-testid="room-sensors"]');
    const lastSensors = () => sensorsAsked.at(-1)!;

    it('lists the motion and presence sensors the registry places there, their state not known', async () => {
      await page();
      expect(lastSensors().name()).toBe('bedroom');
      answer(lastSensors().resource, [
        { id: 1, name: 'Bedroom motion', room: 'bedroom', kind: 'motion sensor' },
        { id: 2, name: 'Bedroom radar', room: 'bedroom', kind: 'presence sensor' },
        // not a sensor of the card, and a sensor of another room the answer should not hold
        { id: 3, name: 'Bedroom lamp', room: 'bedroom', kind: 'light' },
        { id: 4, name: 'Hall motion', room: 'hall up', kind: 'motion sensor' },
      ]);

      const shown = words(await sensors());
      expect(shown).toContain('Motion Bedroom motion state not known yet');
      expect(shown).toContain('Presence Bedroom radar state not known yet');
      expect(shown).not.toContain('Bedroom lamp');
      expect(shown).not.toContain('Hall motion');
    });

    it('shows no card for a room without such a sensor', async () => {
      await page();
      answer(lastSensors().resource, [
        { id: 3, name: 'Bedroom lamp', room: 'bedroom', kind: 'light' },
      ]);

      expect(await sensors()).toBeNull();
    });
  });

  it('shows the windows of the room and the hold of its heating on the heating card', async () => {
    await page();
    answer(lastAsked().resource, {
      ...BEDROOM,
      window: { state: 'open', openSince: '2026-10-08T14:20:00', hold: true },
    } as Room);

    const heating = (await page()).querySelector('[data-testid="room-heating"]');
    expect(words(heating?.querySelector('[data-testid="room-window"]'))).toContain('open');
    expect(heating?.querySelector('[data-testid="room-held"]')).not.toBeNull();
  });

  // HAS-282: the appliances of the household - once, not of any room, for every member
  describe('the appliances of the household', () => {
    const DRYER: Appliance = {
      id: 62,
      name: 'Dryer',
      state: 'finished',
      finishedAt: '2026-10-08T14:05:00',
      awaitingSince: '2026-10-08T14:15:00',
    };
    const WASHER: Appliance = {
      id: 61,
      name: 'Washing machine',
      state: 'running',
      runningSince: '2026-10-08T13:40:00',
    };
    const DISHWASHER: Appliance = { id: 63, name: 'Dishwasher', state: 'idle' };

    const appliancesCard = async () => (await page()).querySelector('[data-testid="appliances"]');

    it('lists every appliance with its state, for a member of any room', async () => {
      await page();
      answer(appliances, [WASHER, DRYER, DISHWASHER]);

      const rows = [...(await appliancesCard())!.querySelectorAll('.appliance')].map(words);
      expect(rows).toEqual([
        'Washing machine Running Running since 13:40',
        'Dryer Finished - waits to be emptied Finished at 14:05 Emptied',
        'Dishwasher Idle',
      ]);
    });

    it('stands once, whichever room is chosen', async () => {
      profile.set(resident('bedroom', 'wardrobe'));
      await page();
      answer(appliances, [DRYER]);

      expect((await page()).querySelectorAll('[data-testid="appliances"]')).toHaveLength(1);
    });

    // the one control of the page that is not a room's - and only next to a finished appliance
    it('offers "Emptied" for the finished one only, and sends it', async () => {
      await page();
      answer(lastAsked().resource, BEDROOM);
      answer(appliances, [WASHER, DRYER, DISHWASHER]);

      const buttons = [...(await appliancesCard())!.querySelectorAll('button')];
      expect(buttons.map(words)).toEqual(['Emptied']);
      buttons[0].click();

      expect(acknowledged).toEqual([62]);
      expect((await controls()).inTheRoom).toEqual([]);
    });

    it('tells a refused acknowledgement next to the appliance', async () => {
      await page();
      answer(appliances, [DRYER]);
      acknowledgeFailure.set({
        id: 62,
        error: new ApiError('client', 409, [
          { message: 'Nothing to acknowledge', code: 'NOTHING_TO_ACKNOWLEDGE' },
        ]),
      });

      expect(
        words((await appliancesCard())!.querySelector('[data-appliance="62"] [role="alert"]')),
      ).toContain('Nothing waits to be emptied any more.');
    });

    it('words an acknowledgement without an answer as one that may have been carried out', async () => {
      await page();
      answer(appliances, [DRYER]);
      acknowledgeFailure.set({ id: 62, error: new ApiError('network', 0) });

      expect(
        words((await appliancesCard())!.querySelector('[data-appliance="62"] [role="alert"]')),
      ).toContain('may have been marked all the same');
    });

    // an acknowledgement without an answer that was carried out: the list read again says so
    it('lets the failure go once the list shows the appliance emptied', async () => {
      await page();
      answer(appliances, [DRYER]);
      acknowledgeFailure.set({ id: 62, error: new ApiError('network', 0) });
      answer(appliances, [{ id: 62, name: 'Dryer', state: 'idle' }]);

      expect(
        (await appliancesCard())!.querySelector('[data-appliance="62"] [role="alert"]'),
      ).toBeNull();
    });

    it('shows no card for a household without appliances, nor while the first answer is on its way', async () => {
      await page();
      expect(await appliancesCard()).toBeNull();

      answer(appliances, []);
      expect(await appliancesCard()).toBeNull();
    });

    it('tells a failure before any answer', async () => {
      await page();
      fail(appliances, new ApiError('server', 502));

      expect((await appliancesCard())!.querySelector('[role="alert"]')).not.toBeNull();
    });
  });
});
