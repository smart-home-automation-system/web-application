import { RoomView } from '../../shared/room-heating/room-views';
import { summariseRooms, toPeople } from './overview-views';

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

describe('toPeople', () => {
  it('reads who is at home and who is away, in the order of the service', () => {
    expect(
      toPeople([
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
    expect(toPeople([{ name: 'Cecylia', present: false, lastCheckedAt: null }])).toEqual([
      { name: 'Cecylia', state: 'not-observed' },
    ]);
  });

  it('reads an entry without the flag as no status, never as away', () => {
    expect(toPeople([{ name: 'Damian' }, { name: 'Ewa', present: 'yes' }])).toEqual([
      { name: 'Damian', state: 'unknown' },
      { name: 'Ewa', state: 'unknown' },
    ]);
  });

  it('leaves out an entry without a name, and an answer that is no list', () => {
    expect(toPeople([{ present: true }, null, { name: '' }])).toEqual([]);
    expect(toPeople(null)).toEqual([]);
    expect(toPeople({ name: 'Aurelia' })).toEqual([]);
  });
});
