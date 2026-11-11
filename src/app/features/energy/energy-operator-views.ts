import { ElicznikDay, EnergyDay, EnergyMonth } from '../../data-access/energy/energy-api';
import { numberOf } from './energy-views';

/**
 * The meter of the operator beside the house's 3EM (HAS-417, the eLicznik portal of Tauron read by energy-service
 * >= 0.17.0, HAS-340). Pure: what the answers hold, with **a value the answer leaves out never 0** - the portal serves
 * a day the morning after it, so the last day stands without the operator until then.
 */

/** A day of the comparison; `apart` is the operator against the 3EM in %, only when both are known. */
export interface OperatorDay {
  readonly day: string;
  readonly meterImport?: number;
  readonly operatorImport?: number;
  readonly importApart?: number;
  readonly meterExport?: number;
  readonly operatorExport?: number;
  readonly exportApart?: number;
}

/** `(operator - meter) / meter` in %, rounded to a tenth; none without both or for a meter of 0. */
export function apartOf(
  operator: number | undefined,
  meter: number | undefined,
): number | undefined {
  return operator === undefined || meter === undefined || meter <= 0
    ? undefined
    : Math.round(((operator - meter) / meter) * 1000) / 10;
}

/** Every day of `days` (oldest first), the newest first, as the answer of `GET /energy/days` holds it. */
export function operatorDays(
  days: readonly string[],
  byDay: ReadonlyMap<string, EnergyDay>,
): readonly OperatorDay[] {
  return [...days].reverse().map((day) => {
    const answer = byDay.get(day);
    const meterImport = numberOf(answer?.imported);
    const operatorImport = numberOf(answer?.elicznikImport);
    const meterExport = numberOf(answer?.exported);
    const operatorExport = numberOf(answer?.elicznikExport);
    return {
      day,
      meterImport,
      operatorImport,
      importApart: apartOf(operatorImport, meterImport),
      meterExport,
      operatorExport,
      exportApart: apartOf(operatorExport, meterExport),
    };
  });
}

/** The sums of the days both meters know, and how many those are. */
export interface OperatorTotals {
  readonly days: number;
  readonly meterImport: number;
  readonly operatorImport: number;
  readonly importApart?: number;
  readonly meterExport: number;
  readonly operatorExport: number;
  readonly exportApart?: number;
}

export function operatorTotals(rows: readonly OperatorDay[]): OperatorTotals {
  const both = rows.filter(
    (row) =>
      row.meterImport !== undefined &&
      row.operatorImport !== undefined &&
      row.meterExport !== undefined &&
      row.operatorExport !== undefined,
  );
  const sum = (of: (row: OperatorDay) => number | undefined) =>
    Math.round(both.reduce((total, row) => total + (of(row) ?? 0), 0) * 1000) / 1000;
  const meterImport = sum((row) => row.meterImport);
  const operatorImport = sum((row) => row.operatorImport);
  const meterExport = sum((row) => row.meterExport);
  const operatorExport = sum((row) => row.operatorExport);
  return {
    days: both.length,
    meterImport,
    operatorImport,
    importApart: both.length > 0 ? apartOf(operatorImport, meterImport) : undefined,
    meterExport,
    operatorExport,
    exportApart: both.length > 0 ? apartOf(operatorExport, meterExport) : undefined,
  };
}

/** Whether any day of the rows has a value of the operator. */
export function anyOperator(rows: readonly OperatorDay[]): boolean {
  return rows.some((row) => row.operatorImport !== undefined || row.operatorExport !== undefined);
}

/** An hour of a day of the portal, with the label of its start: "02:00", the repeated one marked. */
export interface OperatorHour {
  readonly label: string;
  readonly repeated: boolean;
  readonly imported?: number;
  readonly exported?: number;
}

/**
 * The hours of the day of the answer, in the order of the answer (the repeated 02:00 before the other one). An hour
 * without a number between 1 and 24 is left out; the label is the start of the hour on the clock of the house -
 * "02:00 (1)" and "02:00 (2)" the night the clocks go back.
 */
export function operatorHours(day: ElicznikDay | undefined): readonly OperatorHour[] {
  const hours = (day?.hours ?? []).filter((hour) => {
    const number = numberOf(hour?.hour);
    return number !== undefined && Number.isInteger(number) && number >= 1 && number <= 24;
  });
  const doubled = new Set(hours.filter((hour) => hour.repeated === true).map((hour) => hour.hour));
  return hours.map((hour) => {
    const start = `${String((hour.hour as number) - 1).padStart(2, '0')}:00`;
    const repeated = hour.repeated === true;
    const which = repeated ? 1 : 2;
    const label = doubled.has(hour.hour) ? `${start} (${which})` : start;
    return {
      label,
      repeated,
      imported: numberOf(hour.imported),
      exported: numberOf(hour.exported),
    };
  });
}

/** A month of the billing year by the meter of the operator; `undefined` for a month without such a day. */
export interface OperatorMonth {
  readonly month: string;
  readonly imported?: number;
  readonly exported?: number;
  readonly credited?: number;
  readonly balance?: number;
}

/** The months of the year the portal served a day of, in order. */
export function operatorMonths(
  months: readonly EnergyMonth[] | undefined,
): readonly OperatorMonth[] {
  return (months ?? [])
    .filter((month) => typeof month?.month === 'string')
    .map((month) => ({
      month: month.month as string,
      imported: numberOf(month.elicznikImported),
      exported: numberOf(month.elicznikExported),
      credited: numberOf(month.elicznikCredited),
      balance: numberOf(month.elicznikBalance),
    }))
    .filter(
      (month) =>
        month.imported !== undefined ||
        month.exported !== undefined ||
        month.credited !== undefined ||
        month.balance !== undefined,
    );
}

/** The months of the operator by their month, for the line of the same month of the house. */
export function operatorByMonth(
  months: readonly OperatorMonth[],
): ReadonlyMap<string, OperatorMonth> {
  return new Map(months.map((month) => [month.month, month]));
}

/** The credit left by the operator at the end of the last month that has one. */
export function operatorBalanceNow(months: readonly OperatorMonth[]): number | undefined {
  return [...months].reverse().find((month) => month.balance !== undefined)?.balance;
}
