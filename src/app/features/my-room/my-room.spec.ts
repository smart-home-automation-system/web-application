import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FakeResource, answer, fail, fakeResource } from '../../../testing/fake-resource';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { Profile } from '../../core/profile/profile';
import { ProfileStore } from '../../core/profile/profile-store';
import { HeatingApi, HeatingStatus, Room } from '../../data-access/heating/heating-api';
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
  let fixture: ComponentFixture<MyRoom> | undefined;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    profile = signal<Profile | undefined>(resident('bedroom'));
    status = fakeResource();
    asked = [];
    turned = [];
    fixture = undefined;
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: ProfileStore, useValue: { profile } },
        {
          provide: HeatingApi,
          useValue: {
            watchSwitch: () => ({
              ...status,
              switching: signal(false),
              switchFailure: signal(undefined),
              turn: (on: boolean) => turned.push(on),
            }),
            watchRoom: (name: () => string) => {
              const resource = fakeResource<Room | null>();
              asked.push({ name, resource });
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

    it('says so, asks for no room, and still offers the switch of the house', async () => {
      const shown = await page();

      expect(words(shown.querySelector('[data-testid="no-rooms"]'))).toContain(
        'No room is assigned to your profile yet.',
      );
      expect(asked).toEqual([]);
      expect(await card()).toBeNull();
      expect(shown.querySelector('[data-testid="heating-switch"]')).toBeTruthy();
    });

    it('shows the room as soon as the registry assigns one', async () => {
      await page();

      profile.set(resident('wardrobe'));

      expect((await page()).querySelector('[data-testid="no-rooms"]')).toBeNull();
      expect(lastAsked().name()).toBe('wardrobe');
    });
  });

  describe('what can be pressed', () => {
    beforeEach(() => profile.set(resident('bedroom', 'wardrobe')));

    // residents view temperatures and schedules; setting them is the administrator's alone
    it('is the choice of the room and the switch of the house, and nothing about a room', async () => {
      await page();
      answer(lastAsked().resource, BEDROOM);
      answer(status, { isHeatingEnabled: true, updatedAt: '2026-09-28T06:45:12.840868' });
      const shown = await page();

      const controls = [
        ...shown.querySelectorAll('button, a, input, select, textarea, [tabindex]'),
      ];
      const inTheRoom = controls.filter((control) =>
        control.closest('[data-testid="room-heating"]'),
      );
      const elsewhere = controls
        .filter((control) => !control.closest('[data-testid="room-heating"]'))
        .map(words);

      expect(inTheRoom).toEqual([]);
      expect(elsewhere).toEqual(['bedroom', 'wardrobe', 'power_settings_new Switch off']);
    });

    it('hands the switch of the house to the shared card', async () => {
      await page();
      answer(status, { isHeatingEnabled: false, updatedAt: '2026-09-28T06:45:12.840868' });

      expect(words((await page()).querySelector('[data-testid="heating-switch"]'))).toContain(
        'Disabled',
      );
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
});
