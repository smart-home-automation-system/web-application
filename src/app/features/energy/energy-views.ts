import {
  EnergyAlert,
  EnergyFlows,
  EnergyMonth,
  EnergySource,
  EnergyStatus,
} from '../../data-access/energy/energy-api';
import { MessageKey } from '../../i18n/messages';

/**
 * How the energy page reads the answers of `energy-service` (HAS-341) - pure, pinned by its spec.
 * The words of the service are copied here (`RunMode`, `BatteryDirection`, `GridDirection`, the
 * sources, the kinds of an alarm): a value this version does not know is printed as it came, never
 * read as one it knows. A number the answer leaves out is `undefined` - "not known", never 0.
 */

/** A finite number, or `undefined` for anything else - nothing checks an answer. */
export function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** The key of the text for a value, or `undefined` for one this version does not know. */
function labelIn(labels: Readonly<Record<string, MessageKey>>, value: unknown) {
  return typeof value === 'string' && Object.hasOwn(labels, value) ? labels[value] : undefined;
}

/** `RunMode` of energy-service (Data[18] of the SOLAX). */
const RUN_MODES: Readonly<Record<string, MessageKey>> = {
  waiting: 'energy.runMode.waiting',
  checking: 'energy.runMode.checking',
  normal: 'energy.runMode.normal',
  fault: 'energy.runMode.fault',
  'permanent fault': 'energy.runMode.permanentFault',
  updating: 'energy.runMode.updating',
  'eps check': 'energy.runMode.epsCheck',
  eps: 'energy.runMode.eps',
  'self test': 'energy.runMode.selfTest',
  idle: 'energy.runMode.idle',
  standby: 'energy.runMode.standby',
};

export const runModeLabel = (mode: unknown) => labelIn(RUN_MODES, mode);

/** A run mode somebody should look at: a fault, or the house on the battery. */
export function runModeAlarming(mode: unknown): boolean {
  return mode === 'fault' || mode === 'permanent fault' || mode === 'eps';
}

const BATTERY_DIRECTIONS: Readonly<Record<string, MessageKey>> = {
  charging: 'energy.battery.charging',
  discharging: 'energy.battery.discharging',
  idle: 'energy.battery.idle',
};

export const batteryDirectionLabel = (direction: unknown) => labelIn(BATTERY_DIRECTIONS, direction);

const GRID_DIRECTIONS: Readonly<Record<string, MessageKey>> = {
  import: 'energy.grid.import',
  export: 'energy.grid.export',
  idle: 'energy.grid.idle',
};

export const gridDirectionLabel = (direction: unknown) => labelIn(GRID_DIRECTIONS, direction);

/** Where a reading came from: the device itself or a cloud. */
const READING_SOURCES: Readonly<Record<string, MessageKey>> = {
  local: 'energy.readingSource.local',
  cloud: 'energy.readingSource.cloud',
  'solarman-cloud': 'energy.readingSource.solarmanCloud',
};

export const readingSourceLabel = (source: unknown) => labelIn(READING_SOURCES, source);

/** The sources of `GET /energy/status` and of the alarms. */
const SOURCES: Readonly<Record<string, MessageKey>> = {
  meter: 'energy.source.meter',
  solax: 'energy.source.solax',
  sofar: 'energy.source.sofar',
  solaxCloud: 'energy.source.solaxCloud',
  'phase a': 'energy.source.phaseA',
  'phase b': 'energy.source.phaseB',
  'phase c': 'energy.source.phaseC',
};

export const sourceLabel = (source: unknown) => labelIn(SOURCES, source);

const ALERT_KINDS: Readonly<Record<string, MessageKey>> = {
  silent: 'energy.alerts.kind.silent',
  overload: 'energy.alerts.kind.overload',
  alarm: 'energy.alerts.kind.alarm',
  production: 'energy.alerts.kind.production',
};

export const alertKindLabel = (kind: unknown) => labelIn(ALERT_KINDS, kind);

/** One source as the availability card shows it: `reachable` `undefined` is "not known yet". */
export interface SourceView {
  readonly id: string;
  readonly label: MessageKey | undefined;
  readonly reachable: boolean | undefined;
  readonly lastReadingAt: string | undefined;
}

/** The sources of the status, in the order of the answer; one without a name is left out. */
export function sourcesOf(status: EnergyStatus | null | undefined): readonly SourceView[] {
  const sources: unknown = status?.sources;
  if (!Array.isArray(sources)) {
    return [];
  }
  return sources.flatMap((source: EnergySource) =>
    typeof source?.source === 'string'
      ? [
          {
            id: source.source,
            label: sourceLabel(source.source),
            reachable: typeof source.reachable === 'boolean' ? source.reachable : undefined,
            lastReadingAt:
              typeof source.lastReadingAt === 'string' ? source.lastReadingAt : undefined,
          },
        ]
      : [],
  );
}

/** The grid as the SOLAX sees it: `present`, `lost`, or `undefined` while the service does not know. */
export function gridStateOf(
  status: EnergyStatus | null | undefined,
): 'present' | 'lost' | undefined {
  const state = status?.grid?.state;
  return state === 'present' || state === 'lost' ? state : undefined;
}

/** Which way the energy flows along one line of the diagram. */
export type FlowDirection = 'in' | 'out' | 'idle' | 'unknown';

/** Within this many watts of nothing a flow is no flow - the dead band of the service. */
export const DEAD_BAND_WATTS = 20;

/**
 * The flow along a line of the diagram, by the sign of its power: `in` into the house, `out` out of
 * it. For the panels `in` is production; for the battery charging is `out`; for the grid taking
 * from it is `in`.
 */
export function directionOf(watts: number | undefined, intoTheHouse: 1 | -1): FlowDirection {
  if (watts === undefined) {
    return 'unknown';
  }
  const signed = watts * intoTheHouse;
  if (signed > DEAD_BAND_WATTS) {
    return 'in';
  }
  return signed < -DEAD_BAND_WATTS ? 'out' : 'idle';
}

/** The four ends of the diagram and their powers. */
export interface FlowView {
  readonly production: number | undefined;
  readonly solaxPv: number | undefined;
  readonly sofarPv: number | undefined;
  readonly grid: number | undefined;
  readonly battery: number | undefined;
  readonly house: number | undefined;
  readonly panels: FlowDirection;
  readonly gridFlow: FlowDirection;
  readonly batteryFlow: FlowDirection;
}

export function toFlowView(flows: EnergyFlows | null | undefined): FlowView {
  const production = numberOf(flows?.production);
  const grid = numberOf(flows?.gridPower);
  const battery = numberOf(flows?.batteryPower);
  return {
    production,
    solaxPv: numberOf(flows?.solaxPv),
    sofarPv: numberOf(flows?.sofarPv),
    grid,
    battery,
    house: numberOf(flows?.houseLoad),
    // the panels never take: below the dead band they are idle
    panels: directionOf(production, 1),
    gridFlow: directionOf(grid, 1),
    // a battery that charges takes from the house
    batteryFlow: directionOf(battery, -1),
  };
}

/** A power as it is written: W below a kilowatt, kW with two decimals from one on. */
export interface PowerText {
  readonly amount: number;
  readonly unit: 'W' | 'kW';
  readonly format: Intl.NumberFormatOptions;
}

const WATTS: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };
const KILOWATTS: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

/** The size of a power - always positive; its direction is told by words or an arrow. */
export function powerText(watts: number): PowerText {
  const size = Math.abs(watts);
  return size >= 1_000
    ? { amount: size / 1_000, unit: 'kW', format: KILOWATTS }
    : { amount: Math.round(size), unit: 'W', format: WATTS };
}

/** The alarms of the answer that can be shown, newest first; one without a kind or a source is left out. */
export function alertsOf(
  answer: readonly EnergyAlert[] | null | undefined,
): readonly EnergyAlert[] {
  if (!Array.isArray(answer)) {
    return [];
  }
  return answer
    .filter(
      (alert): alert is EnergyAlert =>
        typeof alert?.kind === 'string' && typeof alert.source === 'string',
    )
    .sort((left, right) => (right.openedAt ?? '').localeCompare(left.openedAt ?? ''));
}

/**
 * The billing year that holds a day of the house: it starts in `startMonth` (9 - September, the
 * `period-start` of energy-service). The year of a billing year is the year it starts in.
 */
export function billingYearOf(day: string, startMonth: number): number {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  return month >= startMonth ? year : year - 1;
}

/** The month the billing year of energy-service starts in (`energy.settlement.period-start`). */
export const BILLING_YEAR_STARTS = 9;

/** A month of the settlement as its row shows it. */
export interface MonthView {
  readonly month: string;
  readonly days: number | undefined;
  readonly exported: number | undefined;
  readonly credited: number | undefined;
  readonly imported: number | undefined;
  readonly drawn: number | undefined;
  readonly bought: number | undefined;
  readonly expired: number | undefined;
  readonly stored: number | undefined;
}

export function monthsOf(months: unknown): readonly MonthView[] {
  if (!Array.isArray(months)) {
    return [];
  }
  return months.flatMap((month: EnergyMonth) =>
    typeof month?.month === 'string'
      ? [
          {
            month: month.month,
            days: numberOf(month.days),
            exported: numberOf(month.exported),
            credited: numberOf(month.credited),
            imported: numberOf(month.imported),
            drawn: numberOf(month.drawn),
            bought: numberOf(month.bought),
            expired: numberOf(month.expired),
            stored: numberOf(month.stored),
          },
        ]
      : [],
  );
}

/**
 * The credit "in the grid" now: what the last month with a closed day had left - the rolling
 * twelve months of the net-metering. `undefined` while no month has a day.
 */
export function storedNow(months: readonly MonthView[]): number | undefined {
  return [...months].reverse().find((month) => (month.days ?? 0) > 0)?.stored;
}
