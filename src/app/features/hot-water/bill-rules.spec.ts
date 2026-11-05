import {
  amountProblem,
  noteProblem,
  numberOf,
  overlapping,
  periodProblem,
  volumeProblem,
} from './bill-rules';

// The copy of BillRules of water-service (HAS-323): the form refuses what the service refuses
describe('bill rules', () => {
  it('reads a number with a dot or a comma, and nothing from an empty field', () => {
    expect(numberOf('11,5')).toBe(11.5);
    expect(numberOf(' 1 000.25 ')).toBe(1000.25);
    expect(numberOf('')).toBeUndefined();
    expect(numberOf('eleven')).toBeNaN();
    expect(numberOf('1.2.3')).toBeNaN();
  });

  it('takes a volume of at least 0 with at most three decimals, below a billion', () => {
    expect(volumeProblem('11', true)).toBeUndefined();
    expect(volumeProblem('0', true)).toBeUndefined();
    expect(volumeProblem('11,123', true)).toBeUndefined();
    expect(volumeProblem('11.1230', true)).toBeUndefined();
    expect(volumeProblem('', true)).toBe('water.bills.rule.required');
    expect(volumeProblem('', false)).toBeUndefined();
    expect(volumeProblem('x', false)).toBe('water.bills.rule.number');
    expect(volumeProblem('-1', true)).toBe('water.bills.rule.negative');
    expect(volumeProblem('1.2345', true)).toBe('water.bills.rule.volumeDecimals');
    expect(volumeProblem('1000000000', true)).toBe('water.bills.rule.tooLarge');
  });

  it('takes an optional amount of at least 0 with at most two decimals', () => {
    expect(amountProblem('')).toBeUndefined();
    expect(amountProblem('257,02')).toBeUndefined();
    expect(amountProblem('257.025')).toBe('water.bills.rule.amountDecimals');
    expect(amountProblem('-1')).toBe('water.bills.rule.negative');
    expect(amountProblem('10000000000')).toBe('water.bills.rule.tooLarge');
  });

  // both ends required, in order, from 2000, never past today of the house
  it('takes a period of whole days up to today', () => {
    const today = '2026-11-05';

    expect(periodProblem('2026-10-01', '2026-11-05', today)).toBeUndefined();
    expect(periodProblem('2026-10-01', '2026-10-01', today)).toBeUndefined();
    expect(periodProblem('', '2026-10-01', today)).toBe('water.bills.rule.period');
    expect(periodProblem('2026-10-02', '2026-10-01', today)).toBe('water.bills.rule.order');
    expect(periodProblem('1999-12-31', '2000-01-31', today)).toBe('water.bills.rule.firstYear');
    expect(periodProblem('2026-10-01', '2026-11-06', today)).toBe('water.bills.rule.future');
  });

  it('takes a note of at most 500 characters', () => {
    expect(noteProblem('x'.repeat(500))).toBeUndefined();
    expect(noteProblem('x'.repeat(501))).toBe('water.bills.rule.note');
  });

  // a shared day is an overlap - both ends included
  it('finds the bill a period shares a day with', () => {
    const others = [{ id: 1, periodFrom: '2026-09-29', periodTo: '2026-10-20' }];

    expect(overlapping('2026-10-20', '2026-11-05', others)?.id).toBe(1);
    expect(overlapping('2026-09-01', '2026-09-29', others)?.id).toBe(1);
    expect(overlapping('2026-10-21', '2026-11-05', others)).toBeUndefined();
    expect(overlapping('2026-09-01', '2026-09-28', others)).toBeUndefined();
  });
});
