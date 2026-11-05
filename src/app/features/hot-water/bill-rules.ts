import { WaterBill } from '../../data-access/water/water-api';
import { MessageKey } from '../../i18n/messages';

/**
 * **A copy of `BillRules` of `water-service`** (HAS-318) - what a bill must be before it is sent, so the form refuses
 * what the service refuses, with words of its own. A rule changed in the service is changed here (HAS-323). The
 * overlap of two bills - a shared day, both ends included - is the service's check against its table; the form checks
 * it against the bills it shows, which are that table.
 */
export const FIRST_YEAR = 2000;
export const NOTE_LENGTH = 500;
// NUMERIC(12, 3) and NUMERIC(12, 2) of V4
const VOLUME_LIMIT = 1_000_000_000;
const AMOUNT_LIMIT = 10_000_000_000;

/** A number as typed: a dot or a comma, spaces allowed; `undefined` for an empty field, `NaN` for what is no number. */
export function numberOf(text: string): number | undefined {
  const plain = text.replace(/\s/g, '').replace(',', '.');
  if (plain === '') {
    return undefined;
  }
  return /^-?\d+(\.\d+)?$/.test(plain) ? Number(plain) : Number.NaN;
}

function decimalsOf(text: string): number {
  const plain = text.replace(/\s/g, '').replace(',', '.');
  const dot = plain.indexOf('.');
  return dot < 0 ? 0 : plain.slice(dot + 1).replace(/0+$/, '').length;
}

/** What is wrong with a volume in m³: required or not, at least 0, at most three decimals, below a billion. */
export function volumeProblem(text: string, required: boolean): MessageKey | undefined {
  const value = numberOf(text);
  if (value === undefined) {
    return required ? 'water.bills.rule.required' : undefined;
  }
  if (Number.isNaN(value)) {
    return 'water.bills.rule.number';
  }
  if (value < 0) {
    return 'water.bills.rule.negative';
  }
  if (decimalsOf(text) > 3) {
    return 'water.bills.rule.volumeDecimals';
  }
  return value >= VOLUME_LIMIT ? 'water.bills.rule.tooLarge' : undefined;
}

/** What is wrong with an amount in PLN: optional, at least 0, at most two decimals. */
export function amountProblem(text: string): MessageKey | undefined {
  const value = numberOf(text);
  if (value === undefined) {
    return undefined;
  }
  if (Number.isNaN(value)) {
    return 'water.bills.rule.number';
  }
  if (value < 0) {
    return 'water.bills.rule.negative';
  }
  if (decimalsOf(text) > 2) {
    return 'water.bills.rule.amountDecimals';
  }
  return value >= AMOUNT_LIMIT ? 'water.bills.rule.tooLarge' : undefined;
}

/** What is wrong with a period (`YYYY-MM-DD`, empty when not chosen): both ends, in order, from 2000, not past today. */
export function periodProblem(from: string, to: string, today: string): MessageKey | undefined {
  if (from === '' || to === '') {
    return 'water.bills.rule.period';
  }
  if (to < from) {
    return 'water.bills.rule.order';
  }
  if (Number(from.slice(0, 4)) < FIRST_YEAR) {
    return 'water.bills.rule.firstYear';
  }
  return to > today ? 'water.bills.rule.future' : undefined;
}

export function noteProblem(note: string): MessageKey | undefined {
  return note.length > NOTE_LENGTH ? 'water.bills.rule.note' : undefined;
}

/** The other bill a period shares a day with - both ends included; `undefined` when none does. */
export function overlapping(
  from: string,
  to: string,
  others: readonly WaterBill[],
): WaterBill | undefined {
  return others.find(
    (other) =>
      typeof other.periodFrom === 'string' &&
      typeof other.periodTo === 'string' &&
      other.periodFrom <= to &&
      from <= other.periodTo,
  );
}
