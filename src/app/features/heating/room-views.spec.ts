import { clockTime, groupByFloor, toRoomViews, toWeek } from './room-views';

const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

/** A room as heating-service 1.8.0 answers it, taken from the gateway. */
const LIVING_ROOM = {
  name: 'living room',
  mode: 'HEATING',
  heatingEnabled: true,
  temperature: { value: 19.4, updatedAt: '2026-10-08T18:30:00.817456' },
  heaters: [
    {
      type: 'radiator',
      working: true,
      updatedAt: '2026-10-08T18:31:00.926456',
      inSchedule: true,
      targetTemperature: 21.0,
      scheduledTemperature: 21.0,
      schedules: [
        {
          type: 'HEATING',
          days: WEEKDAYS,
          startTime: '06:00:00',
          endTime: '08:00:00',
          temperature: 21.0,
        },
        {
          type: 'HEATING',
          days: WEEKDAYS,
          startTime: '15:00:00',
          endTime: '22:00:00',
          temperature: 21.0,
        },
        {
          type: 'HEATING',
          days: ['SATURDAY', 'SUNDAY'],
          startTime: '08:00:00',
          endTime: '22:00:00',
          temperature: 21.0,
        },
      ],
    },
    { type: 'floor', scheduledTemperature: 22.5, schedules: [] },
  ],
};

describe('toRoomViews', () => {
  it('reads a room as the service sends it', () => {
    expect(toRoomViews([LIVING_ROOM])).toEqual([
      {
        name: 'living room',
        temperature: 19.4,
        measuredAt: '2026-10-08T18:30:00.817456',
        // the highest of what its heaters are scheduled for
        target: 22.5,
        heaters: [
          {
            kind: 'radiator',
            working: true,
            reportedAt: '2026-10-08T18:31:00.926456',
            callsForHeat: true,
            periods: [
              { days: [0, 1, 2, 3, 4], start: 360, end: 480, temperature: 21 },
              { days: [0, 1, 2, 3, 4], start: 900, end: 1320, temperature: 21 },
              { days: [5, 6], start: 480, end: 1320, temperature: 21 },
            ],
            unreadablePeriods: 0,
          },
          {
            kind: 'floor',
            working: undefined,
            reportedAt: undefined,
            callsForHeat: undefined,
            periods: [],
            unreadablePeriods: 0,
          },
        ],
      },
    ]);
  });

  // right after a start of the service: a restored temperature and nothing else
  it('reads what the service leaves out as not known, never as off or zero', () => {
    const [room] = toRoomViews([
      {
        name: 'office',
        temperature: { value: 23.8, updatedAt: '2026-10-08T20:25:14.935275' },
        heaters: [{ type: 'radiator', schedules: [] }],
      },
    ]);

    expect(room.target).toBeUndefined();
    expect(room.heaters).toEqual([
      {
        kind: 'radiator',
        working: undefined,
        reportedAt: undefined,
        callsForHeat: undefined,
        periods: [],
        unreadablePeriods: 0,
      },
    ]);
  });

  it('reads a room that never reported: no temperature and no time of one', () => {
    expect(toRoomViews([{ name: 'sauna', heaters: [] }])).toEqual([
      {
        name: 'sauna',
        temperature: undefined,
        measuredAt: undefined,
        target: undefined,
        heaters: [],
      },
    ]);
  });

  it('tells a pass that decided "no" from no decision at all', () => {
    const [room] = toRoomViews([
      {
        name: 'office',
        heaters: [
          { type: 'radiator', working: false, inSchedule: false, schedules: [] },
          { type: 'floor', schedules: [] },
        ],
      },
    ]);

    expect(room.heaters?.map((heater) => [heater.working, heater.callsForHeat])).toEqual([
      [false, false],
      [undefined, undefined],
    ]);
  });

  it.each([
    ['a text', '21.5'],
    ['nothing', null],
    ['not a number', Number.NaN],
  ])('reads a temperature that is %s as nothing measured, with no age', (_, value) => {
    const [room] = toRoomViews([
      { name: 'office', temperature: { value, updatedAt: '2026-10-08T20:25:14' }, heaters: [] },
    ]);

    expect(room.temperature).toBeUndefined();
    expect(room.measuredAt).toBeUndefined();
  });

  // a missing list is not an empty list
  it('tells a room without a list of heaters from a room without a heater', () => {
    const [unknown, none] = toRoomViews([{ name: 'office' }, { name: 'loft', heaters: [] }]);

    expect(unknown.heaters).toBeUndefined();
    expect(none.heaters).toEqual([]);
  });

  it('tells a heater without a list of schedules from a heater without a schedule', () => {
    const [room] = toRoomViews([
      { name: 'office', heaters: [{ type: 'radiator' }, { type: 'floor', schedules: [] }] },
    ]);

    expect(room.heaters?.map((heater) => heater.periods)).toEqual([undefined, []]);
  });

  it('counts the periods it cannot draw instead of dropping them silently', () => {
    const period = {
      days: ['MONDAY'],
      startTime: '07:00:00',
      endTime: '09:00:00',
      temperature: 20,
    };
    const [room] = toRoomViews([
      {
        name: 'office',
        heaters: [
          {
            type: 'radiator',
            schedules: [
              period,
              { ...period, days: ['SOMEDAY'] },
              { ...period, days: [] },
              { ...period, startTime: '7 am' },
              { ...period, startTime: '25:00:00' },
              { ...period, endTime: '06:00:00' },
              { ...period, temperature: 'warm' },
              // a cooling period is not drawn as heating
              { ...period, type: 'COOLING' },
              'a period',
            ],
          },
        ],
      },
    ]);

    expect(room.heaters?.[0].periods).toEqual([
      { days: [0], start: 420, end: 540, temperature: 20 },
    ]);
    expect(room.heaters?.[0].unreadablePeriods).toBe(8);
  });

  it('puts the days of a period in the order of the week, each once', () => {
    const [room] = toRoomViews([
      {
        name: 'office',
        heaters: [
          {
            type: 'radiator',
            schedules: [
              {
                days: ['SUNDAY', 'MONDAY', 'SUNDAY', 'WEDNESDAY'],
                startTime: '07:00',
                endTime: '09:00:00.000',
                temperature: 20,
              },
            ],
          },
        ],
      },
    ]);

    expect(room.heaters?.[0].periods?.[0].days).toEqual([0, 2, 6]);
  });

  it('reads a heater of a kind it does not know as a heater, with its state', () => {
    const [room] = toRoomViews([{ name: 'office', heaters: [{ type: 'stove', working: true }] }]);

    expect(room.heaters?.[0]).toMatchObject({ kind: 'other', working: true });
  });

  it.each([
    ['no body', null],
    ['an object', { name: 'office' }],
    ['a text', 'office'],
  ])('reads %s as no rooms', (_, answer) => {
    expect(toRoomViews(answer)).toEqual([]);
  });

  it('leaves out an entry without a name and keeps the rest in the order of the service', () => {
    const rooms = toRoomViews([
      { name: 'office' },
      { heaters: [] },
      null,
      { name: '' },
      { name: 'loft' },
    ]);

    expect(rooms.map((room) => room.name)).toEqual(['office', 'loft']);
  });
});

describe('groupByFloor', () => {
  const rooms = (...names: string[]) => toRoomViews(names.map((name) => ({ name, heaters: [] })));
  const grouped = (...names: string[]) =>
    groupByFloor(rooms(...names)).map((floor) => [floor.id, floor.rooms.map((room) => room.name)]);

  it('puts the rooms on their floors, in the order of the page and not of the service', () => {
    expect(grouped('garden', 'office', 'loft', 'bathroom up', 'living room', 'cinema')).toEqual([
      ['ground', ['living room', 'cinema']],
      ['upper', ['office', 'bathroom up']],
      ['attic', ['loft']],
      ['outside', ['garden']],
    ]);
  });

  // the fifteen rooms heating-service answers with: none of them is left for "Other"
  it('has a floor for every room of the house', () => {
    const house = [
      'office',
      'tobi',
      'livia',
      'bedroom',
      'wardrobe',
      'bathroom up',
      'loft',
      'living room',
      'cinema',
      'bathroom down',
      'entrance',
      'garage',
      'sanctum',
      'sauna',
      'garden',
    ];

    const floors = grouped(...house);

    expect(floors.map(([id]) => id)).toEqual(['ground', 'upper', 'attic', 'outside']);
    expect(floors.at(-1)).toEqual(['outside', ['sanctum', 'sauna', 'garden']]);
  });

  it('leaves out a floor without a room in the answer', () => {
    expect(grouped('loft')).toEqual([['attic', ['loft']]]);
  });

  // a room added to the house since must not vanish from the page
  it('keeps a room it does not know, in a last group of its own', () => {
    expect(grouped('winter garden', 'loft', 'cellar')).toEqual([
      ['attic', ['loft']],
      ['other', ['winter garden', 'cellar']],
    ]);
  });

  it('keeps a room that is listed twice twice', () => {
    expect(grouped('loft', 'loft')).toEqual([['attic', ['loft', 'loft']]]);
  });

  it('is empty for no rooms', () => {
    expect(groupByFloor([])).toEqual([]);
  });
});

describe('toWeek', () => {
  it('lays the periods of every day on its 24 hours, the earlier first', () => {
    const week = toWeek([
      { days: [0, 1], start: 900, end: 1320, temperature: 21.5 },
      { days: [0], start: 360, end: 480, temperature: 21 },
    ]);

    expect(week).toHaveLength(7);
    expect(week[0]).toEqual([
      { start: 360, end: 480, offset: 25, width: expect.closeTo(100 / 12, 6), temperature: 21 },
      {
        start: 900,
        end: 1320,
        offset: 62.5,
        width: expect.closeTo((420 / 1440) * 100, 6),
        temperature: 21.5,
      },
    ]);
    expect(week[1]).toHaveLength(1);
    expect(week.slice(2)).toEqual([[], [], [], [], []]);
  });

  it('is seven empty days for a heater without a schedule', () => {
    expect(toWeek([])).toEqual([[], [], [], [], [], [], []]);
  });
});

describe('clockTime', () => {
  it('writes minutes since midnight as a time of day', () => {
    expect([0, 65, 420, 1439].map(clockTime)).toEqual(['00:00', '01:05', '07:00', '23:59']);
  });
});
