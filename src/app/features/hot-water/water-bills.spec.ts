import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { FakeResource, answer, fakeResource } from '../../../testing/fake-resource';
import { provideI18nTesting, useLanguage } from '../../../testing/i18n';
import { ApiError } from '../../core/api/api-error';
import { WaterApi, WaterBill, WaterBillBody } from '../../data-access/water/water-api';
import { WaterBills, differenceSize } from './water-bills';

// 18:30 in the house, on Thursday 5 November 2026
const NOW = new Date('2026-11-05T17:30:00Z');

const BILLS: readonly WaterBill[] = [
  {
    id: 2,
    periodFrom: '2026-09-29',
    periodTo: '2026-10-20',
    billedVolume: 11,
    meterReading: 398,
    amount: 275.56,
    note: 'Invented',
    measuredVolume: 11.022,
    difference: 0.022,
    differencePercent: 0.2,
  },
  {
    id: 1,
    periodFrom: '2026-07-30',
    periodTo: '2026-08-31',
    billedVolume: 18,
    measuredVolume: 14.76,
    difference: -3.24,
    differencePercent: -18,
  },
];

// The bills of the waterworks (HAS-323): the list, the form, the removal - and no optimistic state
describe('WaterBills', () => {
  let bills: FakeResource<readonly WaterBill[] | null>;
  let writes: { readonly kind: string; readonly id?: number; readonly body?: WaterBillBody }[];
  let answerOfWrite: Observable<void>;
  let fixture: ComponentFixture<WaterBills>;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setInterval', 'clearInterval'] });
    bills = fakeResource();
    writes = [];
    answerOfWrite = of(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideI18nTesting(),
        {
          provide: WaterApi,
          useValue: {
            watchBills: () => bills,
            createBill: (body: WaterBillBody) => {
              writes.push({ kind: 'create', body });
              return answerOfWrite;
            },
            replaceBill: (id: number, body: WaterBillBody) => {
              writes.push({ kind: 'replace', id, body });
              return answerOfWrite;
            },
            deleteBill: (id: number) => {
              writes.push({ kind: 'delete', id });
              return answerOfWrite;
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(WaterBills);
  });

  afterEach(() => vi.useRealTimers());

  const card = () => fixture.nativeElement as HTMLElement;
  const words = (element: Element | null | undefined) =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const part = async (name: string, within: ParentNode = card()) => {
    await fixture.whenStable();
    return within.querySelector(`[data-testid="${name}"]`) as HTMLElement | null;
  };
  const bill = async (id: number) =>
    (await fixture.whenStable(),
    card().querySelector(`[data-testid="bill"][data-id="${id}"]`)) as HTMLElement;

  async function type(name: string, value: string): Promise<void> {
    const input = (await part(name)) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  it('lists the bills with what the house measured and how far it is from them', async () => {
    answer(bills, BILLS);

    const first = await bill(2);
    expect(words(await part('bill-period', first))).toBe('29/09/2026 – 20/10/2026');
    expect(words(await part('bill-billed', first))).toBe('Billed 11 m³');
    expect(words(await part('bill-measured', first))).toBe('Measured 11.022 m³');
    expect(words(await part('bill-difference', first))).toBe('Difference +0.022 m³ (+0.2 %)');
    expect(words(await part('bill-amount', first))).toBe('Amount 275.56 zł');
    expect(words(await part('bill-meter', first))).toBe('Meter reading 398 m³');
    expect(words(await part('bill-note', first))).toBe('Invented');
    // the amount and the meter reading only when given
    expect(await part('bill-meter', await bill(1))).toBeNull();
  });

  // within 3 % plain, within 10 % on a light strip, more on the strip of an error
  it('colours the difference by its size', async () => {
    answer(bills, BILLS);

    expect((await bill(2)).querySelector('.difference--medium, .difference--large')).toBeNull();
    expect((await bill(1)).querySelector('.difference--large')).toBeTruthy();
    expect(differenceSize(-2.9)).toBe('small');
    expect(differenceSize(5)).toBe('medium');
    expect(differenceSize(-10)).toBe('large');
  });

  // missing is never 0: a period without readings is not measured
  it('says not measured for a bill the service could not measure', async () => {
    answer(bills, [{ id: 3, periodFrom: '2025-01-01', periodTo: '2025-01-31', billedVolume: 9 }]);

    expect(words(await part('bill-measured', await bill(3)))).toBe('Measured not measured');
    expect(words(await part('bill-difference', await bill(3)))).toBe('Difference not known');
  });

  it('says when no bill was entered yet', async () => {
    answer(bills, []);

    expect(words(await part('bills-none'))).toBe('No bill has been entered yet.');
  });

  it('refuses a bill the service would refuse, and sends nothing', async () => {
    answer(bills, BILLS);
    (await part('bill-add'))!.click();
    await type('bill-billed-input', '1.2345');
    (await part('bill-save'))!.click();

    const problems = words(await part('bill-problems'));
    expect(problems).toContain('Choose both days of the period.');
    expect(problems).toContain('Billed: at most 3 decimals');
    expect(writes).toEqual([]);
  });

  it('refuses a period that shares a day with another bill', async () => {
    answer(bills, BILLS);
    (await part('bill-add'))!.click();
    await type('bill-from', '10/20/2026');
    await type('bill-to', '11/05/2026');
    await type('bill-billed-input', '8');
    (await part('bill-save'))!.click();

    expect(words(await part('bill-problems'))).toContain(
      'The period shares a day with the bill 29/09/2026 – 20/10/2026.',
    );
    expect(writes).toEqual([]);
  });

  // the whole bill, the optional fields left out when empty; the list moves only with the read that follows
  it('adds a bill and reads the bills again', async () => {
    const refresh = vi.spyOn(bills, 'refresh');
    answer(bills, BILLS);
    (await part('bill-add'))!.click();
    await type('bill-from', '10/21/2026');
    await type('bill-to', '11/04/2026');
    await type('bill-billed-input', '7,5');
    await type('bill-amount-input', '190,20');
    (await part('bill-save'))!.click();
    await fixture.whenStable();

    expect(writes).toEqual([
      {
        kind: 'create',
        body: {
          periodFrom: '2026-10-21',
          periodTo: '2026-11-04',
          billedVolume: 7.5,
          amount: 190.2,
        },
      },
    ]);
    expect(refresh).toHaveBeenCalled();
    expect(await part('bill-form')).toBeNull();
  });

  it('changes a bill whole, with what it had', async () => {
    answer(bills, BILLS);
    (await part('bill-edit', await bill(2)))!.click();
    await type('bill-amount-input', '280');
    (await part('bill-save'))!.click();
    await fixture.whenStable();

    expect(writes).toEqual([
      {
        kind: 'replace',
        id: 2,
        body: {
          periodFrom: '2026-09-29',
          periodTo: '2026-10-20',
          billedVolume: 11,
          meterReading: 398,
          amount: 280,
          note: 'Invented',
        },
      },
    ]);
  });

  it('asks before it removes a bill, and removes it once confirmed', async () => {
    answer(bills, BILLS);
    (await part('bill-remove', await bill(1)))!.click();

    expect(words(await part('bill-remove-question'))).toContain('Remove this bill?');
    expect(writes).toEqual([]);

    (await part('bill-remove-confirm'))!.click();
    await fixture.whenStable();

    expect(writes).toEqual([{ kind: 'delete', id: 1 }]);
  });

  // removed elsewhere already: what was asked is done
  it('takes a bill that is gone as removed', async () => {
    answerOfWrite = throwError(
      () => new ApiError('client', 404, [{ message: 'No water bill 1', code: 'NOT_FOUND_BILL' }]),
    );
    answer(bills, BILLS);
    (await part('bill-remove', await bill(1)))!.click();
    (await part('bill-remove-confirm'))!.click();
    await fixture.whenStable();

    expect(card().querySelector('[role="alert"]')).toBeNull();
  });

  it('tells a bill the service refused, with its words', async () => {
    answerOfWrite = throwError(
      () => new ApiError('client', 400, [{ message: 'Invalid water bill', code: 'INVALID_BILL' }]),
    );
    answer(bills, BILLS);
    (await part('bill-edit', await bill(1)))!.click();
    (await part('bill-save'))!.click();
    await fixture.whenStable();

    const text = words(card());
    expect(text).toContain('The bill was not saved.');
    expect(text).toContain('The service did not take the bill.');
    expect(await part('bill-form')).toBeTruthy();
  });

  it('speaks Polish', async () => {
    await useLanguage('pl');
    answer(bills, BILLS);

    expect(words(await part('bill-billed', await bill(2)))).toBe('Na rachunku 11 m³');
    expect(words(await part('bill-difference', await bill(1)))).toBe('Różnica -3,24 m³ (-18,0 %)');
  });
});
