import { RoomView } from '../../shared/room-heating/room-views';
import { lastCheck, summariseRooms, toPeople } from './overview-views';

const WARSAW = 'Europe/Warsaw';

const heater = (working: boolean | undefined) => ({
  kind: 'radiator' as const,
  working,
  callsForHeat: undefined,
  periods: [],
  unreadablePeriods: 0,
});

const room = (name: string, temperature?: number, working?: (boolean | undefined)[]): RoomView => ({
  name,
  temperature,
  heaters: working?.map(heater),
});

describe('summariseRooms', () => {
  it('counts the rooms and those with a heater whose relay is on', () => {
    const summary = summariseRooms([
      room('living room', 21.4, [true, false]),
      room('bedroom', 18.9, [false]),
      room('office', 20, [true]),
      room('garage', undefined, []),
    ]);

    expect(summary.total).toBe(4);
    expect(summary.heating).toBe(2);
  });

  // after a start of the service no relay has answered: nobody knows, and zero would be a claim
  it('does not count heated rooms while no relay of the house has answered', () => {
    const summary = summariseRooms([room('living room', 21.4, [undefined]), room('garage')]);

    expect(summary.heating).toBeUndefined();
  });

  it('counts none heated once a relay has answered and none is on', () => {
    expect(summariseRooms([room('living room', 21.4, [false])]).heating).toBe(0);
  });

  it('names the coldest and the warmest room that has a reading', () => {
    const summary = summariseRooms([
      room('living room', 21.4),
      room('garage'),
      room('bedroom', 18.9),
      room('sauna', 0),
    ]);

    // a temperature of zero is a reading
    expect(summary.coldest).toEqual({ name: 'sauna', temperature: 0 });
    expect(summary.warmest).toEqual({ name: 'living room', temperature: 21.4 });
  });

  it('has no extremes while no room has a reading', () => {
    const summary = summariseRooms([room('garage'), room('attic')]);

    expect(summary.coldest).toBeUndefined();
    expect(summary.warmest).toBeUndefined();
  });

  it('is empty for no rooms', () => {
    expect(summariseRooms([])).toEqual({
      total: 0,
      heating: undefined,
      coldest: undefined,
      warmest: undefined,
    });
  });
});

describe('summariseRooms: what stands outside the house', () => {
  // a garden in October and a sauna that is on are not the coldest and the warmest room
  it('leaves the rooms outside the house out of the two extremes, and counts them all the same', () => {
    const summary = summariseRooms(
      [room('living room', 21.4), room('bedroom', 18.9), room('garden', 4), room('sauna', 80)],
      ['garden', 'sauna'],
    );

    expect(summary.total).toBe(4);
    expect(summary.coldest?.name).toBe('bedroom');
    expect(summary.warmest?.name).toBe('living room');
  });

  // the service keeps the last reading of a sensor that fell silent: the tile shows its age
  it('carries the time of the reading with each extreme', () => {
    const summary = summariseRooms([
      { name: 'living room', temperature: 21.4, measuredAt: '2026-10-10T18:28:00', heaters: [] },
    ]);

    expect(summary.coldest?.measuredAt).toBe('2026-10-10T18:28:00');
  });
});

describe('toPeople', () => {
  const states = (answer: unknown) =>
    toPeople(answer, WARSAW).map(({ name, state }) => ({ name, state }));

  it('reads who is at home and who is away, in the order of the service', () => {
    expect(
      states([
        { name: 'Borys', present: false, lastCheckedAt: '2026-10-10T18:29:00' },
        { name: 'Aurelia', present: true, lastCheckedAt: '2026-10-10T18:29:00' },
      ]),
    ).toEqual([
      { name: 'Borys', state: 'away' },
      { name: 'Aurelia', state: 'home' },
    ]);
  });

  // how the service lists a member it has stored nothing about: that is not "away"
  it('reads a member who was never checked as not observed', () => {
    expect(states([{ name: 'Cecylia', present: false, lastCheckedAt: null }])).toEqual([
      { name: 'Cecylia', state: 'not-observed' },
    ]);
  });

  it('reads an entry without the flag as no status, never as away', () => {
    expect(states([{ name: 'Damian' }, { name: 'Ewa', present: 'yes' }])).toEqual([
      { name: 'Damian', state: 'unknown' },
      { name: 'Ewa', state: 'unknown' },
    ]);
  });

  it('leaves out an entry without a name, and an answer that is no list', () => {
    expect(states([{ present: true }, null, { name: '' }])).toEqual([]);
    expect(states(null)).toEqual([]);
    expect(states({ name: 'Aurelia' })).toEqual([]);
  });

  it('keeps the time of the last check, as the instant the clocks of the house showed it', () => {
    const [person] = toPeople(
      [{ name: 'Aurelia', present: true, lastCheckedAt: '2026-10-10T18:29:00' }],
      WARSAW,
    );

    expect(person.lastCheckedAt).toBe('2026-10-10T18:29:00');
    expect(person.checkedAt).toBe(Date.parse('2026-10-10T16:29:00Z'));
  });
});

describe('lastCheck', () => {
  // the detection looks for everybody in one pass: its last run is the newest check there is
  it('is the most recent check among the members', () => {
    const people = toPeople(
      [
        { name: 'Aurelia', present: true, lastCheckedAt: '2026-10-10T18:20:00' },
        { name: 'Borys', present: false, lastCheckedAt: '2026-10-10T18:29:00' },
        { name: 'Cecylia', present: false, lastCheckedAt: null },
      ],
      WARSAW,
    );

    expect(lastCheck(people)?.lastCheckedAt).toBe('2026-10-10T18:29:00');
  });

  it('is unknown while nobody was ever checked', () => {
    expect(lastCheck(toPeople([{ name: 'Cecylia', present: false }], WARSAW))).toBeUndefined();
    expect(lastCheck([])).toBeUndefined();
  });
});
