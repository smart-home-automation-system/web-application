import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerInputEvent, MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoDirective } from '@jsverse/transloco';
import { Observable } from 'rxjs';

import { ApiError, toApiError } from '../../core/api/api-error';
import { APP_CONFIG } from '../../core/config/app-config';
import { calendarDate, dayOfCalendar, provideCalendar } from '../../core/i18n/calendar';
import { dateTimeFormat } from '../../core/i18n/intl-formats';
import { LanguageStore } from '../../core/i18n/language-store';
import { houseDay } from '../../core/time/house-date-time';
import { Ticker } from '../../core/time/ticker';
import { WaterApi, WaterBill, WaterBillBody } from '../../data-access/water/water-api';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import {
  NOTE_LENGTH,
  amountProblem,
  noteProblem,
  numberOf,
  overlapping,
  periodProblem,
  volumeProblem,
} from './bill-rules';
import { describeWaterError } from './water-errors';

/** What the card shows below the list: nothing, the form of a new bill, or of a stored one. */
type Panel =
  | { readonly kind: 'list' }
  | { readonly kind: 'new' }
  | { readonly kind: 'edit'; readonly id: number };

/** A write that did not end as asked, with what it was. */
interface Failure {
  readonly summary: MessageKey;
  readonly error: ApiError;
}

/** How far the measured water is from the bill, to be seen at a glance: within 3 %, within 10 %, or more. */
export type DifferenceSize = 'small' | 'medium' | 'large';

export function differenceSize(percent: number): DifferenceSize {
  const size = Math.abs(percent);
  if (size < 3) {
    return 'small';
  }
  return size < 10 ? 'medium' : 'large';
}

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/**
 * The bills of the waterworks (HAS-323, `water-service` >= 0.9.0) on the water page, the administrator's: newest
 * first, each with the period, what was billed, what the house measured over it and how far apart they are - in m³
 * and per cent, coloured by its size - and the amount and the meter reading when given. A form adds or changes a bill
 * (the whole bill, the rules of `BillRules` copied in `bill-rules.ts`), a question comes before a removal. **No
 * optimistic state**: a write is sent, then the bills are read again and only that answer moves the list - one write
 * at a time, one thing open at a time (the rule of the heating schedule editor).
 */
@Component({
  selector: 'app-water-bills',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatTooltipModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    LocalNumberPipe,
  ],
  // the calendar and its texts come with this card, not with the first page of the application
  providers: [provideCalendar()],
  templateUrl: './water-bills.html',
  styleUrl: './water-bills.scss',
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WaterBills {
  private readonly api = inject(WaterApi);
  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly ticker = inject(Ticker);
  private readonly locale = inject(LanguageStore).locale;

  protected readonly bills = this.api.watchBills();
  protected readonly describe = describeWaterError;
  protected readonly NOTE_LENGTH = NOTE_LENGTH;
  protected readonly VOLUME: Intl.NumberFormatOptions = { maximumFractionDigits: 3 };
  protected readonly PERCENT: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  };
  protected readonly SIGNED_VOLUME: Intl.NumberFormatOptions = {
    maximumFractionDigits: 3,
    signDisplay: 'exceptZero',
  };
  protected readonly MONEY: Intl.NumberFormatOptions = {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  };

  protected readonly panel = signal<Panel>({ kind: 'list' });
  protected readonly busy = signal(false);
  protected readonly failure = signal<Failure | undefined>(undefined);
  /** The bill asked about before it is removed. */
  protected readonly askRemove = signal<number | undefined>(undefined);

  // the form
  protected readonly periodFrom = signal('');
  protected readonly periodTo = signal('');
  protected readonly billed = signal('');
  protected readonly meter = signal('');
  protected readonly amount = signal('');
  protected readonly note = signal('');
  /** The problems are told once a save was tried, then follow every change. */
  protected readonly tried = signal(false);

  private readonly keep = viewChild<unknown, ElementRef<HTMLElement>>('keep', { read: ElementRef });

  protected readonly today = computed(() => houseDay(this.ticker.now(), this.zone));
  protected readonly calendarMax = computed(() => calendarDate(this.today()));

  /** The bills of the answer that have an id, newest first - as the service sends them. */
  protected readonly list = computed((): readonly WaterBill[] => {
    const answer: unknown = this.bills.value();
    return Array.isArray(answer)
      ? (answer as WaterBill[]).filter((bill) => typeof bill?.id === 'number')
      : [];
  });

  protected readonly problems = computed(() => ({
    period: periodProblem(this.periodFrom(), this.periodTo(), this.today()),
    billed: volumeProblem(this.billed(), true),
    meter: volumeProblem(this.meter(), false),
    amount: amountProblem(this.amount()),
    note: noteProblem(this.note()),
  }));

  /** The other bill the period of the form shares a day with. */
  protected readonly overlap = computed(() => {
    const from = this.periodFrom();
    const to = this.periodTo();
    if (from === '' || to === '' || to < from) {
      return undefined;
    }
    const panel = this.panel();
    return overlapping(
      from,
      to,
      this.list().filter((bill) => panel.kind !== 'edit' || bill.id !== panel.id),
    );
  });

  protected readonly valid = computed(
    () =>
      Object.values(this.problems()).every((problem) => problem === undefined) && !this.overlap(),
  );

  constructor() {
    // the question takes the focus on "Cancel", the safe answer
    effect(() => this.keep()?.nativeElement.focus());
    // a bill that is gone takes its question and its form with it (removed elsewhere, or by the read-back of a write)
    effect(() => {
      const ids = new Set(this.list().map((bill) => bill.id));
      const asked = this.askRemove();
      if (asked !== undefined && !ids.has(asked)) {
        this.askRemove.set(undefined);
      }
      const panel = this.panel();
      if (panel.kind === 'edit' && !ids.has(panel.id)) {
        this.panel.set({ kind: 'list' });
      }
    });
  }

  /** "31.01.2026 – 24.02.2026", in the language of the interface. */
  protected periodText(bill: WaterBill): string {
    if (typeof bill.periodFrom !== 'string' || typeof bill.periodTo !== 'string') {
      return '';
    }
    const format = dateTimeFormat(this.locale(), {
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    return format.formatRange(
      Date.parse(`${bill.periodFrom}T00:00:00Z`),
      Date.parse(`${bill.periodTo}T00:00:00Z`),
    );
  }

  protected number(value: unknown): number | undefined {
    return finite(value);
  }

  protected sizeOf(bill: WaterBill): DifferenceSize | undefined {
    const percent = finite(bill.differencePercent);
    return percent === undefined ? undefined : differenceSize(percent);
  }

  protected openNew(): void {
    this.fill({});
    this.panel.set({ kind: 'new' });
  }

  protected openEdit(bill: WaterBill): void {
    if (bill.id === undefined) {
      return;
    }
    this.fill(bill);
    this.panel.set({ kind: 'edit', id: bill.id });
  }

  protected close(): void {
    this.panel.set({ kind: 'list' });
    this.failure.set(undefined);
  }

  protected textOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected calendarOf(day: string): Date | null {
    return day === '' ? null : calendarDate(day);
  }

  protected picked(field: 'from' | 'to', event: MatDatepickerInputEvent<Date>): void {
    const day = event.value ? dayOfCalendar(event.value) : '';
    (field === 'from' ? this.periodFrom : this.periodTo).set(day);
  }

  protected save(): void {
    this.tried.set(true);
    const panel = this.panel();
    if (!this.valid() || this.busy() || panel.kind === 'list') {
      return;
    }
    const body: WaterBillBody = {
      periodFrom: this.periodFrom(),
      periodTo: this.periodTo(),
      billedVolume: numberOf(this.billed())!,
      ...optional('meterReading', numberOf(this.meter())),
      ...optional('amount', numberOf(this.amount())),
      ...(this.note().trim() === '' ? {} : { note: this.note().trim() }),
    };
    const write =
      panel.kind === 'new' ? this.api.createBill(body) : this.api.replaceBill(panel.id, body);
    this.send(write, 'water.bills.saveFailed', () => this.panel.set({ kind: 'list' }));
  }

  protected remove(id: number): void {
    this.send(this.api.deleteBill(id), 'water.bills.removeFailed', () =>
      this.askRemove.set(undefined),
    );
  }

  /**
   * One write, then the bills read again whatever it came to - a write without an answer may have been carried out.
   * A bill already removed counts as removed.
   */
  private send(write: Observable<void>, summary: MessageKey, done?: () => void): void {
    this.busy.set(true);
    this.failure.set(undefined);
    const after = (failure?: Failure) =>
      void this.bills
        .refresh()
        .catch(() => undefined)
        .then(() => {
          this.busy.set(false);
          if (failure) {
            this.failure.set(failure);
          } else {
            done?.();
          }
        });
    write.subscribe({
      error: (error: unknown) => {
        const failure = toApiError(error);
        if (summary === 'water.bills.removeFailed' && failure.hasCode('NOT_FOUND_BILL')) {
          after();
          return;
        }
        after({
          summary: failure.kind === 'network' ? 'water.bills.noAnswer' : summary,
          error: failure,
        });
      },
      complete: () => after(),
    });
  }

  private fill(bill: WaterBill): void {
    this.periodFrom.set(bill.periodFrom ?? '');
    this.periodTo.set(bill.periodTo ?? '');
    this.billed.set(textOf(bill.billedVolume));
    this.meter.set(textOf(bill.meterReading));
    this.amount.set(textOf(bill.amount));
    this.note.set(bill.note ?? '');
    this.tried.set(false);
    this.failure.set(undefined);
    this.askRemove.set(undefined);
  }
}

/** A stored number as the form shows it: as typed, a dot for the decimals - the form takes a comma as well. */
function textOf(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

/** An optional field of the body: left out when the form leaves it empty. */
function optional<K extends 'meterReading' | 'amount'>(
  key: K,
  value: number | undefined,
): Partial<Record<K, number>> {
  return value === undefined ? {} : ({ [key]: value } as Partial<Record<K, number>>);
}
