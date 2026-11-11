import {
  anyOperator,
  apartOf,
  operatorBalanceNow,
  operatorDays,
  operatorHours,
  operatorMonths,
  operatorTotals,
} from './energy-operator-views';

describe('the meter of the operator (HAS-417)', () => {
  it('measures the operator against the 3EM in %, only with both', () => {
    expect(apartOf(34.988, 34.76)).toBe(0.7);
    expect(apartOf(0.161, 0.17)).toBe(-5.3);
    expect(apartOf(undefined, 34.76)).toBeUndefined();
    expect(apartOf(1, undefined)).toBeUndefined();
    // a 3EM of 0 is no base
    expect(apartOf(0.1, 0)).toBeUndefined();
  });

  it('lists every day the newest first, a day not served yet without the operator - never 0', () => {
    const rows = operatorDays(
      ['2026-11-08', '2026-11-09', '2026-11-10'],
      new Map([
        [
          '2026-11-08',
          {
            day: '2026-11-08',
            imported: 17.07,
            exported: 0.6,
            elicznikImport: 17.223,
            elicznikExport: 0.598,
          },
        ],
        ['2026-11-10', { day: '2026-11-10', imported: 35.56, exported: 0.37 }],
      ]),
    );

    expect(rows.map((row) => row.day)).toEqual(['2026-11-10', '2026-11-09', '2026-11-08']);
    expect(rows[0]).toEqual({
      day: '2026-11-10',
      meterImport: 35.56,
      operatorImport: undefined,
      importApart: undefined,
      meterExport: 0.37,
      operatorExport: undefined,
      exportApart: undefined,
    });
    expect(rows[1].meterImport).toBeUndefined();
    expect(rows[2].importApart).toBe(0.9);
    expect(rows[2].exportApart).toBe(-0.3);
    expect(anyOperator(rows)).toBe(true);
    expect(anyOperator(rows.slice(0, 2))).toBe(false);
  });

  it('sums only the days both meters know', () => {
    const totals = operatorTotals([
      { day: 'a', meterImport: 10, operatorImport: 10.1, meterExport: 1, operatorExport: 0.98 },
      { day: 'b', meterImport: 20, operatorImport: 20.2, meterExport: 2, operatorExport: 1.96 },
      { day: 'c', meterImport: 30, meterExport: 3 },
    ]);

    expect(totals).toEqual({
      days: 2,
      meterImport: 30,
      operatorImport: 30.3,
      importApart: 1,
      meterExport: 3,
      operatorExport: 2.94,
      exportApart: -2,
    });
    expect(operatorTotals([]).importApart).toBeUndefined();
  });

  it('labels the hours by their start, the two of the night the clocks go back apart', () => {
    const hours = operatorHours({
      day: '2026-10-25',
      hours: [
        { hour: 2, imported: 1.482, exported: 0 },
        { hour: 3, repeated: true, imported: 1.392, exported: 0 },
        { hour: 3, repeated: false, imported: 1.363, exported: 0 },
        { hour: 4, imported: 1.271 },
        { hour: 25, imported: 9 },
      ],
    });

    expect(hours.map((hour) => hour.label)).toEqual(['01:00', '02:00 (1)', '02:00 (2)', '03:00']);
    expect(hours[1].repeated).toBe(true);
    // an hour the answer leaves without its export has none, never 0
    expect(hours[3].exported).toBeUndefined();
    expect(operatorHours(undefined)).toEqual([]);
  });

  it('keeps the months the portal served a day of, and the credit left at the last of them', () => {
    const months = operatorMonths([
      {
        month: '2026-09',
        days: 30,
        elicznikImported: 121.37,
        elicznikCredited: 144.61,
        elicznikBalance: 23.24,
      },
      { month: '2026-10', days: 31, elicznikImported: 262.38, elicznikBalance: 0 },
      { month: '2026-11', days: 2, imported: 31.2 },
    ]);

    expect(months.map((month) => month.month)).toEqual(['2026-09', '2026-10']);
    expect(months[0].exported).toBeUndefined();
    // 0 is a balance
    expect(operatorBalanceNow(months)).toBe(0);
    expect(operatorBalanceNow([])).toBeUndefined();
    expect(operatorMonths(undefined)).toEqual([]);
  });
});
