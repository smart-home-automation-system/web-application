import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS,
  MatSlideToggleModule,
} from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoDirective } from '@jsverse/transloco';
import { Observable } from 'rxjs';

import { ApiError, toApiError } from '../../../core/api/api-error';
import { dateTimeFormat } from '../../../core/i18n/intl-formats';
import { LanguageStore } from '../../../core/i18n/language-store';
import { HeatingApi, HeaterScheduleBody } from '../../../data-access/heating/heating-api';
import { MessageKey } from '../../../i18n/messages';
import { ApiErrorStrip } from '../../../shared/api-error/api-error-strip';
import { LocalNumberPipe } from '../../../shared/local-number/local-number.pipe';
import { ScheduleEntry } from '../../../shared/room-heating/room-views';
import { describeHeatingError } from '../heating-errors';
import {
  DAY_NAMES,
  MAX_TEMPERATURE,
  MIN_TEMPERATURE,
  daysProblem,
  minutesOf,
  orderProblem,
  overlapping,
  temperatureOf,
  temperatureProblem,
  timeProblem,
  timeText,
} from './heating-schedule-rules';

/** 1 January 2024 was a Monday: the days of that week give the names of the weekdays. */
const A_MONDAY = Date.UTC(2024, 0, 1);
const A_DAY_MS = 24 * 60 * 60 * 1_000;

/** What the editor shows below the list: nothing, the form of a new period, or of a stored one. */
type Panel =
  | { readonly kind: 'list' }
  | { readonly kind: 'new' }
  | { readonly kind: 'edit'; readonly id: number };

/** A write that did not end as asked, with what it was. */
interface Failure {
  readonly summary: MessageKey;
  readonly error: ApiError;
}

/**
 * The periods of one heater of a room, written through `heating-service` 1.14.0 (HAS-356, HAS-357):
 * the list with a switch per period, a form for a new or a changed one, and the removal after a
 * question. **No optimistic state**: a write is sent, then the rooms are read again (`readBack`) and
 * only that answer moves the list - the answer of the write is not used, as for the heating
 * switch. One write at a time; one thing open at a time. Every rule of the service is checked here
 * first (`heating-schedule-rules.ts`).
 */
@Component({
  selector: 'app-heater-schedule-editor',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSlideToggleModule,
    MatTooltipModule,
    TranslocoDirective,
    ApiErrorStrip,
    LocalNumberPipe,
  ],
  providers: [
    // the switch of a period shows what the service stored, never a flip of its own
    { provide: MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS, useValue: { disableToggleValue: true } },
  ],
  templateUrl: './heater-schedule-editor.html',
  styleUrl: './heater-schedule-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaterScheduleEditor {
  private readonly api = inject(HeatingApi);
  private readonly locale = inject(LanguageStore).locale;

  /** The identifier of the room in the backend. */
  readonly room = input.required<string>();
  /** `radiator` or `floor` - the heater the periods are of. */
  readonly heater = input.required<'radiator' | 'floor'>();
  /** Every period of the heater as the last answer has it, switched off ones included. */
  readonly entries = input.required<readonly ScheduleEntry[]>();
  /** Reads the rooms again; resolves when that call has answered. */
  readonly readBack = input.required<() => Promise<void>>();

  protected readonly MIN = MIN_TEMPERATURE;
  protected readonly MAX = MAX_TEMPERATURE;
  protected readonly ONE_DECIMAL: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };
  protected readonly weekdays = [0, 1, 2, 3, 4, 5, 6];
  protected readonly time = timeText;

  protected readonly panel = signal<Panel>({ kind: 'list' });
  protected readonly busy = signal(false);
  protected readonly failure = signal<Failure | undefined>(undefined);
  /** The period asked about before it is removed. */
  protected readonly askRemove = signal<number | undefined>(undefined);

  // the form
  protected readonly days = signal<readonly number[]>([]);
  protected readonly start = signal('');
  protected readonly end = signal('');
  protected readonly temperature = signal('');
  /** The problems are told once a save was tried, then follow every change. */
  protected readonly tried = signal(false);

  private readonly keep = viewChild<unknown, ElementRef<HTMLElement>>('keep', { read: ElementRef });

  /** The periods in the order of the week: by their first day, then by their start. */
  protected readonly sorted = computed(() =>
    [...this.entries()].sort((a, b) => a.days[0] - b.days[0] || a.start - b.start),
  );

  protected readonly dayNames = computed(() => {
    const format = dateTimeFormat(this.locale(), { weekday: 'short', timeZone: 'UTC' });
    return this.weekdays.map((day) => format.format(A_MONDAY + day * A_DAY_MS));
  });

  protected readonly problems = computed(() => {
    const start = minutesOf(this.start());
    const end = minutesOf(this.end());
    const value = temperatureOf(this.temperature());
    return {
      days: daysProblem(this.days()),
      start: timeProblem(this.start()),
      end: timeProblem(this.end()),
      order: start !== undefined && end !== undefined ? orderProblem(start, end) : undefined,
      temperature: temperatureProblem(value),
    };
  });

  /** The other period of the heater the form meets, a switched-off one included. */
  protected readonly overlap = computed(() => {
    const start = minutesOf(this.start());
    const end = minutesOf(this.end());
    if (start === undefined || end === undefined || start >= end) {
      return undefined;
    }
    const panel = this.panel();
    const others = this.entries().filter((entry) => panel.kind !== 'edit' || entry.id !== panel.id);
    return overlapping({ days: this.days(), start, end }, others);
  });

  protected readonly valid = computed(
    () =>
      Object.values(this.problems()).every((problem) => problem === undefined) && !this.overlap(),
  );

  constructor() {
    // the question takes the focus on "Cancel", the safe answer
    effect(() => this.keep()?.nativeElement.focus());
    // a period that is gone takes its question and its form with it (removed elsewhere, or by the
    // read-back of a write) - cleared here, never hidden: a hidden question came back by itself
    effect(() => {
      const ids = new Set(this.entries().map((entry) => entry.id));
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

  protected daysText(entry: ScheduleEntry): string {
    const names = this.dayNames();
    return entry.days.map((day) => names[day]).join(', ');
  }

  protected openNew(): void {
    this.fill([], '', '', '');
    this.panel.set({ kind: 'new' });
  }

  protected openEdit(entry: ScheduleEntry): void {
    if (entry.id === undefined) {
      return;
    }
    this.fill(entry.days, timeText(entry.start), timeText(entry.end), String(entry.temperature));
    this.panel.set({ kind: 'edit', id: entry.id });
  }

  protected close(): void {
    this.panel.set({ kind: 'list' });
    this.failure.set(undefined);
  }

  protected setDays(value: readonly number[] | null): void {
    this.days.set([...(value ?? [])].sort((a, b) => a - b));
  }

  protected textOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected save(): void {
    this.tried.set(true);
    const panel = this.panel();
    if (!this.valid() || this.busy() || panel.kind === 'list') {
      return;
    }
    const body: HeaterScheduleBody = {
      days: this.days().map((day) => DAY_NAMES[day]),
      startTime: this.start(),
      endTime: this.end(),
      temperature: temperatureOf(this.temperature())!,
    };
    const write =
      panel.kind === 'new'
        ? this.api.createSchedule(this.room(), this.heater(), body)
        : this.api.replaceSchedule(panel.id, body);
    this.send(write, 'heating.editor.saveFailed', () => this.panel.set({ kind: 'list' }));
  }

  protected toggle(entry: ScheduleEntry): void {
    if (entry.id === undefined || this.busy()) {
      return;
    }
    this.send(this.api.setScheduleEnabled(entry.id, !entry.enabled), 'heating.editor.switchFailed');
  }

  protected remove(id: number): void {
    this.send(this.api.deleteSchedule(id), 'heating.editor.removeFailed', () =>
      this.askRemove.set(undefined),
    );
  }

  /**
   * One write, then the rooms read again whatever it came to - a write without an answer may have
   * been carried out. Never aborted with the window: a write cut off halfway is carried out or not,
   * and nobody would know which. A schedule already removed counts as removed.
   */
  private send(write: Observable<void>, summary: MessageKey, done?: () => void): void {
    this.busy.set(true);
    this.failure.set(undefined);
    const after = (failure?: Failure) =>
      void this.readBack()()
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
        if (summary === 'heating.editor.removeFailed' && failure.hasCode('NOT_FOUND_SCHEDULE')) {
          after();
          return;
        }
        after({
          summary: failure.kind === 'network' ? 'heating.editor.noAnswer' : summary,
          error: failure,
        });
      },
      complete: () => after(),
    });
  }

  protected readonly describe = describeHeatingError;

  private fill(days: readonly number[], start: string, end: string, temperature: string): void {
    this.days.set(days);
    this.start.set(start);
    this.end.set(end);
    this.temperature.set(temperature);
    this.tried.set(false);
    this.failure.set(undefined);
    this.askRemove.set(undefined);
  }
}
