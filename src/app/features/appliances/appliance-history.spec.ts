import { ApplianceRun } from '../../data-access/appliance/appliance-api';
import { addedUp, counterOf, countersOf, energyParts, runsIn } from './appliance-history';

const WEEK = { from: '2026-10-20T00:00:00', to: '2026-10-27T00:00:00' };

describe('appliance history', () => {
  // HAS-283: counted by the start of a cycle, from included and to not
  it('counts the cycles of a period by their start', () => {
    const runs: ApplianceRun[] = [
      { id: 1, startedAt: '2026-10-19T23:59:59', finishedAt: '2026-10-20T01:00:00', energyWh: 500 },
      { id: 2, startedAt: '2026-10-20T00:00:00', finishedAt: '2026-10-20T02:00:00', energyWh: 640 },
      { id: 3, startedAt: '2026-10-26T21:00:00', finishedAt: '2026-10-26T22:00:00', energyWh: 300 },
      { id: 4, startedAt: '2026-10-27T00:00:00', finishedAt: '2026-10-27T01:00:00', energyWh: 100 },
    ];

    expect(counterOf(runs, WEEK)).toEqual({ cycles: 2, energyWh: 940, energyUnknown: 0, running: 0 });
  });

  // the service leaves energyWh out when it does not know it: never 0 Wh
  it('counts a cycle without its energy apart, and one still running without energy', () => {
    const runs: ApplianceRun[] = [
      { id: 1, startedAt: '2026-10-21T10:00:00', finishedAt: '2026-10-21T11:00:00' },
      { id: 2, startedAt: '2026-10-26T20:00:00' },
      { id: 3, startedAt: '2026-10-22T10:00:00', finishedAt: '2026-10-22T11:00:00', energyWh: 16 },
    ];

    expect(counterOf(runs, WEEK)).toEqual({ cycles: 3, energyWh: 16, energyUnknown: 1, running: 1 });
  });

  it('leaves out a cycle whose start cannot be read', () => {
    expect(counterOf([{ id: 1, finishedAt: '2026-10-21T11:00:00', energyWh: 100 }], WEEK).cycles).toBe(0);
    expect(runsIn([{ id: 1, startedAt: 'yesterday' }], WEEK)).toEqual([]);
  });

  // the house is in Europe/Warsaw: 20:30Z on 26 October is 21:30 there
  it('counts the three periods of historyRange and adds the appliances up', () => {
    const instant = Date.parse('2026-10-26T20:30:00Z');
    const washer = countersOf(
      [
        { id: 1, startedAt: '2026-10-26T20:00:00', finishedAt: '2026-10-26T21:00:00', energyWh: 700 },
        { id: 2, startedAt: '2026-10-22T08:00:00', finishedAt: '2026-10-22T09:00:00', energyWh: 650 },
        { id: 3, startedAt: '2026-10-01T08:00:00', finishedAt: '2026-10-01T09:00:00', energyWh: 600 },
      ],
      instant,
      'Europe/Warsaw',
    );
    const dryer = countersOf([{ id: 9, startedAt: '2026-10-26T19:22:32' }], instant, 'Europe/Warsaw');

    expect([washer.day.cycles, washer.week.cycles, washer.month.cycles]).toEqual([1, 2, 3]);
    expect(addedUp([washer, dryer]).day).toEqual({ cycles: 2, energyWh: 700, energyUnknown: 0, running: 1 });
  });

  it('lists the cycles of a period the newest first, with their durations', () => {
    const views = runsIn(
      [
        {
          id: 43,
          startedAt: '2026-10-26T19:22:32',
          finishedAt: '2026-10-26T21:24:59',
          energyWh: 664,
          acknowledgedAt: '2026-10-26T21:25:52.698738',
          acknowledgedBy: 'Liwia',
        },
        { id: 44, startedAt: '2026-10-26T22:00:00' },
      ],
      WEEK,
    );

    expect(views.map((view) => view.key)).toEqual(['44@2026-10-26T22:00:00', '43@2026-10-26T19:22:32']);
    expect(views[1]).toEqual(
      expect.objectContaining({ durationMinutes: 122, energyWh: 664, acknowledgedAfterMinutes: 1, acknowledgedBy: 'Liwia' }),
    );
    expect(views[0].durationMinutes).toBeUndefined();
  });

  it('tells an amount of energy in Wh below a kilowatt-hour', () => {
    expect(energyParts(664)).toEqual({ value: 664, unit: 'Wh' });
    expect(energyParts(1_330)).toEqual({ value: 1.33, unit: 'kWh' });
  });
});
