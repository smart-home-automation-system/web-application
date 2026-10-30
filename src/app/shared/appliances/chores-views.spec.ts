import { ApiError } from '../../core/api/api-error';
import {
  CHORES_ERROR_TEXTS,
  choresOf,
  describeChoresError,
  sharePercent,
  toChoresTable,
} from './chores-views';

describe('toChoresTable', () => {
  it('puts the members, then the former, in rows and every appliance named in a column', () => {
    const table = toChoresTable({
      members: [
        {
          member: 'Aurelia',
          appliances: [
            {
              applianceId: 131,
              name: 'Washing machine',
              opportunities: 2,
              done: 1,
              doneAway: 0,
              share: 0.5,
            },
          ],
          total: { opportunities: 2, done: 1, doneAway: 0, share: 0.5 },
        },
      ],
      former: [
        {
          member: 'Zenon',
          appliances: [{ applianceId: 133, opportunities: 1, done: 1, doneAway: 0 }],
        },
      ],
      unattributed: [
        { applianceId: 131, count: 2 },
        { applianceId: 132, count: 1 },
      ],
      unknownPresence: 4,
    });

    expect(table?.columns).toEqual([
      { id: 131, name: 'Washing machine' },
      { id: 133, name: undefined },
    ]);
    expect(table?.rows.map((row) => [row.member, row.former, row.cells.length])).toEqual([
      ['Aurelia', false, 2],
      ['Zenon', true, 2],
    ]);
    expect(table?.rows[0].cells[1]).toBeUndefined();
    expect(table?.unattributed).toBe(3);
    expect(table?.unknownPresence).toBe(4);
  });

  // missing is never read as 0
  it('keeps what the answer leaves out as not known', () => {
    const table = toChoresTable({
      members: [{ member: 'Aurelia', appliances: [{ applianceId: 131 }] }, { appliances: [] }],
    });

    expect(table?.rows).toHaveLength(1);
    expect(table?.rows[0].cells[0]).toEqual({
      opportunities: undefined,
      done: undefined,
      doneAway: undefined,
      share: undefined,
    });
    expect(table?.rows[0].total).toBeUndefined();
    expect(table?.unattributed).toBeUndefined();
    expect(table?.unknownPresence).toBeUndefined();
  });

  it('has no table without an answer', () => {
    expect(toChoresTable(null)).toBeUndefined();
    expect(toChoresTable(undefined)).toBeUndefined();
  });
});

describe('choresOf', () => {
  it('finds the member whatever the case, never a former one', () => {
    const table = toChoresTable({ members: [{ member: 'Borys' }], former: [{ member: 'Zenon' }] });

    expect(choresOf(table, 'borys')?.member).toBe('Borys');
    expect(choresOf(table, 'Zenon')).toBeUndefined();
    expect(choresOf(table, undefined)).toBeUndefined();
  });
});

describe('sharePercent', () => {
  it('is a whole percentage, 0 included, and nothing without a share', () => {
    expect(sharePercent({ share: 0.833 })).toBe(83);
    expect(sharePercent({ share: 0 })).toBe(0);
    expect(sharePercent({})).toBeUndefined();
  });
});

describe('describeChoresError', () => {
  // the codes of the report of appliance-service (HAS-345): a new one fails here until it has a text
  it('has a text for every refusal of the report', () => {
    expect(Object.keys(CHORES_ERROR_TEXTS)).toEqual(['INVALID_RANGE']);
    expect(
      describeChoresError(
        new ApiError('client', 400, [{ message: 'Invalid range', code: 'INVALID_RANGE' }]),
      ),
    ).toEqual({
      key: 'chores.error.invalidRange',
    });
  });
});
