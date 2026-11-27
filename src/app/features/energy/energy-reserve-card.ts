import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSliderModule } from '@angular/material/slider';
import {
  MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS,
  MatSlideToggleModule,
} from '@angular/material/slide-toggle';
import { TranslocoDirective } from '@jsverse/transloco';

import { ApiError, toApiError } from '../../core/api/api-error';
import { PollingResource } from '../../core/api/polling-resource';
import { APP_CONFIG } from '../../core/config/app-config';
import { Ticker } from '../../core/time/ticker';
import { BatteryReserve, EnergyApi, ReserveBody } from '../../data-access/energy/energy-api';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import {
  CONFIRM_DIALOG_SIZE,
  ConfirmData,
  ConfirmDialog,
} from '../../shared/confirm-dialog/confirm-dialog';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { DomainTile } from '../../shared/domain-tile/domain-tile';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { lightReadBack } from '../../shared/lights/light-read-back';
import { describeEnergyError } from './energy-errors';
import {
  RESERVE_DEFAULT_LEVEL,
  RESERVE_ENDS,
  RESERVE_END_LABELS,
  RESERVE_LEVEL,
  RESERVE_LONGEST_UNTIL_DAYS,
  RESERVE_PROBLEM_LABELS,
  ReserveEnd,
  floorBelow,
  houseNow,
  needsQuestion,
  reserveBody,
  reserveProblem,
  tomorrowEvening,
  untilFor,
  writeStateLabel,
} from './energy-reserve';
import { numberOf } from './energy-views';

/** A write that did not end as asked, with what it was. */
interface Failure {
  readonly summary: MessageKey;
  readonly error: ApiError;
}

/**
 * The battery reserve of the SOLAX (HAS-496, energy-service >= 0.21.0 - the Back Up work mode): its switch, the level on
 * a slider and how long it holds - until switched off, until tomorrow 18:00 or until a time - written whole with "Send".
 * **Switching it on or raising its level asks first** in a window over the page: both charge the battery from the grid
 * at up to 5 kW; lowering it, changing its end or switching it off are sent at once. The form follows what the service
 * stored until it is changed here; a send or "Undo changes" lets it follow again.
 *
 * What the service says: whether it holds, the level, the end, and what became of the last write to the inverter. The
 * SolaX cloud takes the work mode and the level to charge to, never the floor (Min SoC, 2026-11-24): while the reserve
 * is on, the card says the floor is set in SolaxCloud by hand.
 *
 * **No optimistic state**: a write, then the reserve read again at once and 2.5 s later - only that answer moves the
 * card; one write at a time, never aborted with the page. The rules are a copy of `ReserveRules` (`energy-reserve.ts`).
 */
@Component({
  selector: 'app-energy-reserve-card',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSliderModule,
    MatSlideToggleModule,
    TranslocoDirective,
    ApiErrorStrip,
    DisplayTextPipe,
    DomainTile,
    HouseDateTimePipe,
  ],
  providers: [
    // the switch shows what the form holds, flipped by the code only
    { provide: MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS, useValue: { disableToggleValue: true } },
  ],
  templateUrl: './energy-reserve-card.html',
  styleUrl: './energy-reserve-card.scss',
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergyReserveCard {
  private readonly api = inject(EnergyApi);
  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly ticker = inject(Ticker);
  private readonly dialog = inject(MatDialog);

  /** The reserve, polled by the page: the battery chart draws its level too - one call for both. */
  readonly reserve = input.required<PollingResource<BatteryReserve | null>>();

  protected readonly LEVEL = RESERVE_LEVEL;
  protected readonly LONGEST = RESERVE_LONGEST_UNTIL_DAYS;
  protected readonly ENDS = RESERVE_ENDS;
  protected readonly END_LABELS = RESERVE_END_LABELS;
  protected readonly PROBLEM_LABELS = RESERVE_PROBLEM_LABELS;
  protected readonly describe = describeEnergyError;
  protected readonly writeStateLabel = writeStateLabel;

  protected readonly stored = computed(() => this.reserve().value() ?? undefined);
  protected readonly storedOn = computed(() => this.stored()?.enabled === true);
  protected readonly storedLevel = computed(() => numberOf(this.stored()?.level));
  /** The reserve the inverter holds only down to a lower Min SoC (HAS-519), with both numbers. */
  protected readonly floor = computed(() => floorBelow(this.stored()));

  // the form
  protected readonly on = signal(false);
  protected readonly level = signal(RESERVE_DEFAULT_LEVEL);
  protected readonly end = signal<ReserveEnd>('none');
  protected readonly date = signal('');
  protected readonly edited = signal(false);
  protected readonly tried = signal(false);
  protected readonly busy = signal(false);
  protected readonly failure = signal<Failure | undefined>(undefined);
  protected readonly asking = signal(false);
  private questionDialog?: MatDialogRef<ConfirmDialog, boolean>;
  /** The body asked about in the window, while it is open. */
  private readonly asked = signal<ReserveBody | undefined>(undefined);
  private destroyed = false;

  protected readonly tomorrow = computed(() => tomorrowEvening(this.ticker.now(), this.zone));
  /** The bounds of the date field: from now to seven days ahead, wall clock of the house, to the minute. */
  protected readonly dateMin = computed(() => houseNow(this.ticker.now(), this.zone).slice(0, 16));
  protected readonly until = computed(() =>
    untilFor(this.end(), this.date(), this.ticker.now(), this.zone),
  );
  protected readonly problem = computed(() =>
    reserveProblem(this.on(), this.level(), this.until(), houseNow(this.ticker.now(), this.zone)),
  );

  private readonly readBack = lightReadBack(async () => {
    await this.reserve().refresh();
  });

  constructor() {
    // the form shows what the service stored, until it is changed here
    effect(() => {
      const stored = this.stored();
      if (stored && !untracked(this.edited)) {
        this.fill(stored);
      }
    });
    // a question with nothing left to ask goes for good, the window closed with no answer: the reserve holds already at
    // the level asked or above (switched on elsewhere, or by an earlier write)
    effect(() => {
      const asked = this.asked();
      const level = this.storedLevel();
      if (asked && this.storedOn() && level !== undefined && level >= asked.level) {
        this.questionDialog?.close(false);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.questionDialog?.close(false);
    });
  }

  private fill(stored: BatteryReserve): void {
    this.on.set(stored.enabled === true);
    this.level.set(numberOf(stored.level) ?? RESERVE_DEFAULT_LEVEL);
    const until = stored.until;
    if (until === undefined) {
      this.end.set('none');
      this.date.set('');
    } else {
      this.end.set('date');
      this.date.set(until.slice(0, 16));
    }
  }

  protected edit(change: () => void): void {
    this.edited.set(true);
    change();
  }

  protected chooseEnd(end: ReserveEnd): void {
    this.edit(() => {
      this.end.set(end);
      if (end === 'date' && this.date() === '') {
        this.date.set(this.tomorrow().slice(0, 16));
      }
    });
  }

  protected textOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  /** The form back to what the service stored. */
  protected undo(): void {
    this.edited.set(false);
    this.tried.set(false);
    const stored = this.stored();
    if (stored) {
      this.fill(stored);
    }
  }

  /** The form checked first; switching on or raising the level asked about in the window, the rest sent at once. */
  protected send(): void {
    this.tried.set(true);
    const until = this.until();
    if (this.problem() !== undefined || until === undefined || this.busy() || this.asking()) {
      return;
    }
    const body = reserveBody(this.on(), this.level(), until);
    if (needsQuestion(this.stored(), body)) {
      this.ask(body);
    } else {
      this.write(body);
    }
  }

  private ask(body: ReserveBody): void {
    this.asking.set(true);
    this.asked.set(body);
    this.questionDialog = this.dialog.open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, {
      ...CONFIRM_DIALOG_SIZE,
      data: {
        icon: 'battery_charging_full',
        title: 'energy.reserve.title',
        question: 'energy.reserve.question',
        params: { level: body.level },
        confirm: 'energy.reserve.confirm',
        cancel: 'energy.reserve.dontChange',
        testId: 'reserve-question',
      },
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
    this.questionDialog.afterClosed().subscribe((answer) => {
      this.questionDialog = undefined;
      this.asking.set(false);
      this.asked.set(undefined);
      if (answer === true && !this.destroyed) {
        this.write(body);
      }
    });
  }

  /** One write, then the reserve read again whatever it came to - a write without an answer may have been carried out. */
  private write(body: ReserveBody): void {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.failure.set(undefined);
    const after = (failed?: Failure) =>
      void this.readBack()
        .catch(() => undefined)
        .then(() => {
          this.busy.set(false);
          if (failed) {
            this.failure.set(failed);
          } else {
            this.edited.set(false);
            this.tried.set(false);
            const stored = this.stored();
            if (stored) {
              this.fill(stored);
            }
          }
        });
    this.api.saveReserve(body).subscribe({
      error: (error: unknown) => {
        const failed = toApiError(error);
        after({
          summary:
            failed.kind === 'network' ? 'energy.reserve.noAnswer' : 'energy.reserve.saveFailed',
          error: failed,
        });
      },
      complete: () => after(),
    });
  }
}
