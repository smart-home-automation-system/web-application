import { summarise, toSensorRows } from './sensor-rows';

const reporting = (room: string) => ({
  room,
  lastReadingAt: '2026-10-08T14:24:14.418018',
  stale: false,
  muted: false,
});

describe('toSensorRows', () => {
  it('reads a sensor as the service sends it', () => {
    expect(toSensorRows([reporting('office')])).toEqual([
      { room: 'office', lastReadingAt: '2026-10-08T14:24:14.418018', stale: false, muted: false },
    ]);
  });

  it('puts the silent sensors first - those to look at before the muted - and keeps the rest in order', () => {
    const rows = toSensorRows([
      reporting('office'),
      { ...reporting('garden'), stale: true, muted: true },
      reporting('loft'),
      { ...reporting('bathroom down'), stale: true },
      { ...reporting('garage'), stale: true },
      { ...reporting('wardrobe'), muted: true },
    ]);

    expect(rows.map((row) => row.room)).toEqual([
      'bathroom down',
      'garage',
      'garden',
      'office',
      'loft',
      'wardrobe',
    ]);
  });

  it.each([
    ['no body', null],
    ['an object', { room: 'office' }],
    ['a text', 'office'],
  ])('reads %s as no sensors', (_, answer) => {
    expect(toSensorRows(answer)).toEqual([]);
  });

  it('leaves out an entry without a room', () => {
    const rows = toSensorRows([null, {}, { room: '' }, { room: 7 }, reporting('office')]);

    expect(rows.map((row) => row.room)).toEqual(['office']);
  });

  // "reporting" has to be something the service said, never the reading of a missing field
  it('does not guess whether a sensor is silent', () => {
    const [missing, wrong] = toSensorRows([{ room: 'office' }, { room: 'loft', stale: 'no' }]);

    expect(missing.stale).toBeUndefined();
    expect(wrong.stale).toBeUndefined();
  });

  it('reads a time that is not a text as no reading', () => {
    const [row] = toSensorRows([{ room: 'office', lastReadingAt: null, stale: false }]);

    expect(row.lastReadingAt).toBeUndefined();
  });
});

describe('summarise', () => {
  it('counts the silent sensors, muted or not', () => {
    const summary = summarise(
      toSensorRows([
        reporting('office'),
        { ...reporting('garden'), stale: true, muted: true },
        { ...reporting('garage'), stale: true },
      ]),
    );

    expect(summary).toEqual({ total: 3, silent: 2, allReporting: false });
  });

  it('says that all report only when every one is known to', () => {
    expect(summarise(toSensorRows([reporting('office'), reporting('loft')])).allReporting).toBe(
      true,
    );
    expect(summarise(toSensorRows([reporting('office'), { room: 'loft' }])).allReporting).toBe(
      false,
    );
    expect(summarise([]).allReporting).toBe(false);
  });
});
