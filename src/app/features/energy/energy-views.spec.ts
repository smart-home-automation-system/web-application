import {
  alertsOf,
  billingYearOf,
  directionOf,
  gridStateOf,
  monthsOf,
  powerText,
  runModeAlarming,
  runModeLabel,
  sourcesOf,
  storedNow,
  toFlowView,
} from './energy-views';
import { daysIn, daysQuery, shiftDay } from './energy-days';

describe('the energy page reads', () => {
  // the sign convention of the house: the grid positive while the house takes, the battery while it charges
  it('the way each line of the diagram flows, with the dead band of the service', () => {
    const view = toFlowView({
      production: 5320,
      gridPower: -1480,
      batteryPower: 2150,
      houseLoad: 1690,
    });
    expect(view.panels).toBe('in');
    expect(view.gridFlow).toBe('out');
    expect(view.batteryFlow).toBe('out');
    expect(directionOf(20, 1)).toBe('idle');
    expect(directionOf(-20, 1)).toBe('idle');
    expect(directionOf(21, 1)).toBe('in');
    expect(directionOf(-500, -1)).toBe('in');
  });

  // a value the service leaves out is not known - never 0, never idle
  it('a power the answer leaves out as not known', () => {
    const view = toFlowView({ production: 0 });
    expect(view.production).toBe(0);
    expect(view.panels).toBe('idle');
    expect(view.grid).toBeUndefined();
    expect(view.gridFlow).toBe('unknown');
    expect(toFlowView(null).batteryFlow).toBe('unknown');
    expect(toFlowView({ houseLoad: '12' as unknown as number }).house).toBeUndefined();
  });

  it('a power in W below a kilowatt and in kW from one on, its size only', () => {
    expect(powerText(540.4)).toMatchObject({ amount: 540, unit: 'W' });
    expect(powerText(-1480)).toMatchObject({ amount: 1.48, unit: 'kW' });
    expect(powerText(999.6)).toMatchObject({ amount: 1000, unit: 'W' });
  });

  // RunMode of energy-service: a mode this version does not know is printed as it came
  it('the run mode of the SOLAX in words, and which of them somebody should look at', () => {
    expect(runModeLabel('eps')).toBe('energy.runMode.eps');
    expect(runModeLabel('permanent fault')).toBe('energy.runMode.permanentFault');
    expect(runModeLabel('turbo')).toBeUndefined();
    expect(runModeLabel('constructor')).toBeUndefined();
    expect(runModeAlarming('fault')).toBe(true);
    expect(runModeAlarming('eps')).toBe(true);
    expect(runModeAlarming('normal')).toBe(false);
  });

  it('the sources of the status, reachable null as not known', () => {
    expect(
      sourcesOf({
        sources: [
          { source: 'meter', reachable: true, lastReadingAt: '2026-11-02T16:45:18.48' },
          { source: 'solaxCloud', reachable: null },
          { reachable: false },
          { source: 'windmill', reachable: false },
        ],
      }),
    ).toEqual([
      {
        id: 'meter',
        label: 'energy.source.meter',
        reachable: true,
        lastReadingAt: '2026-11-02T16:45:18.48',
      },
      {
        id: 'solaxCloud',
        label: 'energy.source.solaxCloud',
        reachable: undefined,
        lastReadingAt: undefined,
      },
      { id: 'windmill', label: undefined, reachable: false, lastReadingAt: undefined },
    ]);
    expect(sourcesOf(null)).toEqual([]);
  });

  // a grid not known is never lost: after a start the service says null until two reads agree
  it('the grid as present, lost or not known', () => {
    expect(gridStateOf({ grid: { state: 'lost' } })).toBe('lost');
    expect(gridStateOf({ grid: { state: 'present' } })).toBe('present');
    expect(gridStateOf({ grid: { state: null } })).toBeUndefined();
    expect(gridStateOf({})).toBeUndefined();
  });

  it('the open alarms newest first, leaving out what it cannot name', () => {
    expect(
      alertsOf([
        { source: 'phase b', kind: 'overload', openedAt: '2026-11-02T10:00:00' },
        { source: 'sofar', kind: 'alarm', openedAt: '2026-11-02T12:00:00', detail: 'GridOVP' },
        { kind: 'silent' },
      ]).map((alert) => alert.source),
    ).toEqual(['sofar', 'phase b']);
    expect(alertsOf(null)).toEqual([]);
  });

  // energy.settlement.period-start of energy-service: the billing year starts in September
  it('the billing year of a day', () => {
    expect(billingYearOf('2026-11-02', 9)).toBe(2026);
    expect(billingYearOf('2026-09-01', 9)).toBe(2026);
    expect(billingYearOf('2026-08-31', 9)).toBe(2025);
  });

  it('the credit in the grid now: what the last month with a closed day left', () => {
    const months = monthsOf([
      { month: '2026-09', days: 30, stored: 27.16 },
      { month: '2026-10', days: 31, stored: 12.5 },
      { month: '2026-11', days: 0, stored: 0 },
    ]);
    expect(storedNow(months)).toBe(12.5);
    expect(storedNow(monthsOf([{ month: '2026-09', days: 0, stored: 0 }]))).toBeUndefined();
    expect(monthsOf('none')).toEqual([]);
  });

  // the closed days up to yesterday, both ends included, on the calendar of the house
  it('the days a period of the days card asks for', () => {
    expect(daysQuery('week', '2026-11-02')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    expect(daysQuery('month', '2026-03-01')).toEqual({ from: '2026-01-30', to: '2026-02-28' });
    expect(daysIn({ from: '2026-10-30', to: '2026-11-01' })).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    // the night the clocks change is a day like another
    expect(shiftDay('2026-10-25', 1)).toBe('2026-10-26');
  });
});
