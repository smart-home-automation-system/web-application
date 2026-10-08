import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FakeResource, answer, fail, fakeResource } from '../../../testing/fake-resource';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { HeatingApi, Room } from '../../data-access/heating/heating-api';
import { Rooms } from './rooms';

/** Thursday 8 October 2026, 14:30:00 on the clocks of the house (Europe/Warsaw, summer time). */
const NOW = Date.parse('2026-10-08T12:30:00Z');

const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

const LIVING_ROOM: Room = {
  name: 'living room',
  heatingEnabled: true,
  temperature: { value: 19.4, updatedAt: '2026-10-08T14:27:00.817456' },
  heaters: [
    {
      type: 'radiator',
      working: true,
      updatedAt: '2026-10-08T14:28:00.926456',
      inSchedule: true,
      targetTemperature: 21.5,
      scheduledTemperature: 21.5,
      schedules: [
        {
          type: 'HEATING',
          days: WEEKDAYS,
          startTime: '06:00:00',
          endTime: '08:00:00',
          temperature: 21,
        },
        {
          type: 'HEATING',
          days: WEEKDAYS,
          startTime: '13:00:00',
          endTime: '22:00:00',
          temperature: 21.5,
        },
        {
          type: 'HEATING',
          days: ['SATURDAY', 'SUNDAY'],
          startTime: '08:00:00',
          endTime: '22:30:00',
          temperature: 21.5,
        },
      ],
    },
    { type: 'floor', working: false, inSchedule: false, schedules: [] },
  ],
};

/** As the service answers right after a start: a restored temperature and nothing decided. */
const OFFICE: Room = {
  name: 'office',
  temperature: { value: 23.8, updatedAt: '2026-10-08T14:10:00.935275' },
  heaters: [{ type: 'radiator', scheduledTemperature: 20.5, schedules: [] }],
};

const SAUNA: Room = { name: 'sauna', heaters: [] };

describe('Rooms', () => {
  let rooms: FakeResource<readonly Room[] | null>;
  let fixture: ComponentFixture<Rooms>;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    rooms = fakeResource();
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        { provide: HeatingApi, useValue: { watchRooms: () => rooms } },
      ],
    });
    fixture = TestBed.createComponent(Rooms);
  });

  afterEach(() => vi.useRealTimers());

  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function card(): Promise<HTMLElement> {
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).querySelector('[data-testid="rooms"]')!;
  }

  async function room(name: string): Promise<HTMLElement> {
    return (await card()).querySelector(`[data-room="${name}"]`)!;
  }

  async function open(name: string): Promise<HTMLElement> {
    (await room(name)).querySelector('button')!.click();
    return (await room(name)).querySelector('[data-testid="room-panel"]')!;
  }

  it('shows a progress bar until the call has answered', async () => {
    expect((await card()).querySelector('mat-progress-bar')).toBeTruthy();

    answer(rooms, [LIVING_ROOM]);

    expect((await card()).querySelector('mat-progress-bar')).toBeNull();
  });

  it('shows a room: its temperature with the age of the reading, the target and its heaters', async () => {
    answer(rooms, [LIVING_ROOM]);

    const summary = words((await room('living room')).querySelector('button'));

    expect(summary).toContain('living room');
    expect(summary).toContain('19.4 °C');
    expect(summary).toContain('Measured 3 min ago');
    expect(summary).toContain('Target 21.5 °C');
    expect(summary).toContain('Radiator: heating Calls for heat');
    expect(summary).toContain('Floor heating: off');
  });

  it('marks a heater by what its relay reported, and one that never answered as unknown', async () => {
    answer(rooms, [LIVING_ROOM, OFFICE]);

    const states = async (name: string) =>
      [...(await room(name)).querySelectorAll('.heater')].map((heater) =>
        heater.getAttribute('data-state'),
      );

    expect(await states('living room')).toEqual(['on', 'off']);
    expect(await states('office')).toEqual(['unknown']);
  });

  // right after a start of the service: nothing was decided, so nothing is claimed
  it('says "no status yet" for a heater the service has not heard from, never "off"', async () => {
    answer(rooms, [OFFICE]);

    const summary = words((await room('office')).querySelector('button'));

    expect(summary).toContain('23.8 °C');
    expect(summary).toContain('Target 20.5 °C');
    expect(summary).toContain('Radiator: no status yet');
    expect(summary).not.toContain(': off');
    expect(summary).not.toContain('Calls for heat');
  });

  it('says that a room has not reported, and that it has no heater', async () => {
    answer(rooms, [SAUNA]);

    const summary = words((await room('sauna')).querySelector('button'));

    expect(summary).toContain('No reading yet');
    expect(summary).toContain('No heater');
    expect(summary).not.toContain('°C');
    // without a heater there is no schedule to be outside of
    expect(summary).not.toContain('No schedule right now');
  });

  it('says that a room with heaters is outside its schedule when none is on', async () => {
    answer(rooms, [{ ...OFFICE, heaters: [{ type: 'radiator', working: false, schedules: [] }] }]);

    expect(words(await room('office'))).toContain('No schedule right now');
  });

  it('says that the service lists no heaters when the answer carries no list', async () => {
    answer(rooms, [{ name: 'office' }]);

    expect(words(await room('office'))).toContain('The service does not list the heaters.');
  });

  it('groups the rooms by floor, each floor under its name', async () => {
    answer(rooms, [SAUNA, OFFICE, LIVING_ROOM, { name: 'winter garden', heaters: [] }]);

    const floors = [...(await card()).querySelectorAll('.floor')].map((floor) => [
      words(floor.querySelector('h3')),
      [...floor.querySelectorAll('[data-room]')].map((entry) => entry.getAttribute('data-room')),
    ]);

    expect(floors).toEqual([
      ['Ground floor', ['living room']],
      ['Upper floor', ['office']],
      ['Outside', ['sauna']],
      ['Other', ['winter garden']],
    ]);
  });

  describe('the week of a room', () => {
    it('is closed until the room is opened, and the button says which it is', async () => {
      answer(rooms, [LIVING_ROOM]);
      const button = (await room('living room')).querySelector('button')!;

      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect((await card()).querySelector('[data-testid="room-panel"]')).toBeNull();

      const panel = await open('living room');

      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(panel.id).toBe(button.getAttribute('aria-controls'));
    });

    // a room with several periods: every day of the week with its own
    it('shows every day with its periods in words, the times and the temperature', async () => {
      answer(rooms, [LIVING_ROOM]);

      const days = [
        ...(await open('living room'))
          .querySelectorAll('.schedule')[0]
          .querySelectorAll('.week__day'),
      ].map((day) => words(day));

      expect(days).toEqual([
        'Mon 06:00–08:00 · 21 °C 13:00–22:00 · 21.5 °C',
        'Tue 06:00–08:00 · 21 °C 13:00–22:00 · 21.5 °C',
        'Wed 06:00–08:00 · 21 °C 13:00–22:00 · 21.5 °C',
        'Thu (today) 06:00–08:00 · 21 °C 13:00–22:00 · 21.5 °C',
        'Fri 06:00–08:00 · 21 °C 13:00–22:00 · 21.5 °C',
        'Sat 08:00–22:30 · 21.5 °C',
        'Sun 08:00–22:30 · 21.5 °C',
      ]);
    });

    it('draws a bar per period and marks now on the row of today, by the clock of the house', async () => {
      answer(rooms, [LIVING_ROOM]);

      const days = [
        ...(await open('living room'))
          .querySelectorAll('.schedule')[0]
          .querySelectorAll('.week__day'),
      ];
      const thursday = days[3];
      const marker = thursday.querySelector<HTMLElement>('.week__now')!;

      expect(days.map((day) => day.querySelectorAll('.week__period').length)).toEqual([
        2, 2, 2, 2, 2, 1, 1,
      ]);
      expect(days.filter((day) => day.querySelector('.week__now'))).toEqual([thursday]);
      // 14:30 of 24 hours
      expect(parseFloat(marker.style.left)).toBeCloseTo((870 / 1440) * 100, 3);
      expect(thursday.querySelector<HTMLElement>('.week__period')!.style.left).toBe('25%');
    });

    it('says what the relay of each heater last reported, and when', async () => {
      answer(rooms, [LIVING_ROOM]);

      const [radiator, floor] = [...(await open('living room')).querySelectorAll('.schedule')].map(
        words,
      );

      expect(radiator).toContain('Radiator heating · reported 2 min ago');
      // no time of a report: nothing is said about when
      expect(floor).not.toContain('reported');
    });

    // a heater with no period at all
    it('says that a heater has no schedule', async () => {
      answer(rooms, [LIVING_ROOM]);

      const floor = (await open('living room')).querySelectorAll('.schedule')[1];

      expect(words(floor)).toContain('No schedule.');
      expect(floor.querySelector('app-heater-week')).toBeNull();
    });

    it('says that the service lists no schedule when the heater carries no list', async () => {
      answer(rooms, [{ name: 'office', heaters: [{ type: 'radiator' }] }]);

      expect(words(await open('office'))).toContain('The service does not list the schedule.');
    });

    it('says how many periods it could not read, next to those it could', async () => {
      const period = {
        days: ['MONDAY'],
        startTime: '07:00:00',
        endTime: '09:00:00',
        temperature: 20,
      };
      answer(rooms, [
        {
          name: 'office',
          heaters: [{ type: 'radiator', schedules: [period, { ...period, startTime: 'early' }] }],
        },
      ]);

      const panel = await open('office');

      expect(words(panel)).toContain('07:00–09:00 · 20 °C');
      expect(words(panel)).toContain('Periods that could not be read: 1.');
      expect(words(panel)).not.toContain('No schedule.');
    });

    it('says that a room without a heater has none', async () => {
      answer(rooms, [SAUNA]);

      expect(words(await open('sauna'))).toBe('No heater');
    });

    it('shows one room at a time, and closes it again', async () => {
      answer(rooms, [LIVING_ROOM, OFFICE]);

      await open('living room');
      await open('office');

      expect(
        [...(await card()).querySelectorAll('.room--open')].map((entry) =>
          entry.getAttribute('data-room'),
        ),
      ).toEqual(['office']);

      expect(await open('office')).toBeNull();
    });

    it('stays open over the next answers of the service', async () => {
      answer(rooms, [LIVING_ROOM]);
      await open('living room');

      answer(rooms, [
        { ...LIVING_ROOM, temperature: { value: 20.1, updatedAt: '2026-10-08T14:29:30' } },
      ]);

      expect(words(await room('living room'))).toContain('20.1 °C');
      expect((await room('living room')).querySelector('[data-testid="room-panel"]')).toBeTruthy();
    });
  });

  // a 200 without a body, or anything that is no list, is not a house without rooms
  it.each([
    ['no body', null],
    ['an object', {} as unknown as Room[]],
  ])('says that the service did not answer with a list for %s', async (_, value) => {
    answer(rooms, value);

    const shown = words(await card());

    expect(shown).toContain('The service did not answer with a list of rooms.');
    expect(shown).not.toContain('The service lists no room.');
  });

  it('names the button of a room by the room, and describes it by what the card says', async () => {
    answer(rooms, [LIVING_ROOM]);
    const shown = await room('living room');
    const button = shown.querySelector('button')!;
    const byId = (attribute: string) =>
      words(shown.querySelector(`[id="${button.getAttribute(attribute)}"]`));

    expect(byId('aria-labelledby')).toBe('living room');
    expect(byId('aria-describedby')).toContain('19.4 °C');
    // the panel does not exist while the room is closed
    expect(button.hasAttribute('aria-controls')).toBe(false);
  });

  it('gives two rooms of one name panels of their own', async () => {
    answer(rooms, [SAUNA, SAUNA]);
    (await card()).querySelectorAll<HTMLElement>('[data-room="sauna"] button')[0].click();

    const ids = [...(await card()).querySelectorAll('[data-testid="room-panel"]')].map(
      (panel) => panel.id,
    );

    expect(new Set(ids).size).toBe(2);
  });

  it('says that the service lists no room when it answers with none', async () => {
    answer(rooms, []);

    expect(words(await card())).toContain('The service lists no room.');
  });

  it('keeps the last rooms on screen next to the failure of the next call', async () => {
    answer(rooms, [LIVING_ROOM]);
    fail(rooms, new ApiError('server', 502));

    const shown = await card();

    expect(words(shown)).toContain('19.4 °C');
    expect(words(shown.querySelector('[role="alert"]'))).toContain(
      'The service is not available right now (error 502).',
    );
  });

  it('shows only the failure when nothing was ever answered', async () => {
    fail(rooms, new ApiError('network', 0));

    const shown = await card();

    expect(shown.querySelector('[role="alert"]')).toBeTruthy();
    expect(words(shown)).not.toContain('The service lists no room.');
    expect(shown.querySelector('.floor')).toBeNull();
  });

  it('speaks Polish, except for the identifiers of the rooms', async () => {
    answer(rooms, [LIVING_ROOM, OFFICE, SAUNA]);
    await useLanguage('pl');

    const shown = words(await card());

    expect(shown).toContain('Parter');
    expect(shown).toContain('living room');
    expect(shown).toContain('19,4 °C');
    expect(shown).toContain('Pomiar 3 min temu');
    expect(shown).toContain('Cel 21,5 °C');
    expect(shown).toContain('Grzejnik: grzeje Wymaga grzania');
    expect(shown).toContain('Podłoga: nie grzeje');
    expect(shown).toContain('Grzejnik: brak stanu');
    expect(shown).toContain('Brak odczytu');
    expect(words(await open('living room'))).toContain('czw. (dzisiaj) 06:00–08:00 · 21 °C');
  });
});
