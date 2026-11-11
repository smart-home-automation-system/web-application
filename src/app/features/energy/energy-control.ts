import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
  MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS,
  MatSlideToggleModule,
} from '@angular/material/slide-toggle';
import { TranslocoDirective } from '@jsverse/transloco';
import { Observable } from 'rxjs';

import { ApiError, toApiError } from '../../core/api/api-error';
import { APP_CONFIG } from '../../core/config/app-config';
import { houseDay } from '../../core/time/house-date-time';
import { Ticker } from '../../core/time/ticker';
import { ChargeRun, EnergyApi, PlannedOutage } from '../../data-access/energy/energy-api';
import { MessageKey } from '../../i18n/messages';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { DomainTile } from '../../shared/domain-tile/domain-tile';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { lightReadBack } from '../../shared/lights/light-read-back';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import {
  CONFIRM_DIALOG_SIZE,
  ConfirmData,
  ConfirmDialog,
} from '../../shared/confirm-dialog/confirm-dialog';
import {
  AUTOMATION_MARGIN,
  AUTOMATION_POWER,
  CHARGE_TARGET,
  automationApplies,
  decimalOf,
  outageKindLabel,
  outageScopeLabel,
  runEndLabel,
  runGoingOn,
  runSourceLabel,
  runStateLabel,
  untilOf,
  wholeOf,
  within,
} from './energy-charge';
import { shiftDay } from './energy-days';
import { describeEnergyError } from './energy-errors';
import { numberOf } from './energy-views';
import { PowerValue } from './power-value';

/** A write that did not end as asked, with what it was. */
interface Failure {
  readonly summary: MessageKey;
  readonly error: ApiError;
}

/**
 * The charge of the battery from the grid and its automation before a planned outage (HAS-342, the
 * administrator's - the energy page): four cards, one call each.
 * - **The charge**: the one going on - its state, who started it, its window, the battery now and the
 *   minutes to its target, and its cancel - or the form of a new one: the target SOC and an optional
 *   end as a time of day. **The start asks first, in a window over the page** (owner, 2026-11-11 - the
 *   rule of the water valve; HAS-342 had sent it without a question), and so does the cancel of a charge
 *   the automation started: it also skips the outage it was for. The cancel of a charge of the dashboard
 *   is sent at once. The commands stand in the bottom right corner of the card.
 * - **The charges** of the last 30 days.
 * - **The automation**: its switch, target, power and margin, written whole and read back.
 * - **The planned outages** of Tauron with the planned start of the charge and its skip.
 *
 * **No optimistic state**: a write is sent, then the cards are read again at once and once more
 * 2.5 s later (the pattern of the lights) - only those answers move what is on screen. One write at
 * a time per card; a write is never aborted with the page.
 */
@Component({
  selector: 'app-energy-control',
  imports: [
    NgTemplateOutlet,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    TranslocoDirective,
    ApiErrorStrip,
    DisplayTextPipe,
    DomainTile,
    HouseDateTimePipe,
    LocalNumberPipe,
    PowerValue,
  ],
  providers: [
    // the switch shows what the service stored, never a flip of its own
    { provide: MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS, useValue: { disableToggleValue: true } },
  ],
  templateUrl: './energy-control.html',
  styleUrl: './energy-control.scss',
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergyControl {
  private readonly api = inject(EnergyApi);
  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly ticker = inject(Ticker);
  private readonly dialog = inject(MatDialog);

  protected readonly charge = this.api.watchCharge();

  /** The charges of the last 30 days: from the midnight 30 days back to the midnight after today. */
  private readonly runsRange = computed(
    () => {
      const today = houseDay(this.ticker.now(), this.zone);
      return { from: `${shiftDay(today, -30)}T00:00:00`, to: `${shiftDay(today, 1)}T00:00:00` };
    },
    { equal: (a, b) => a.from === b.from && a.to === b.to },
  );
  protected readonly runs = this.api.watchChargeRuns(this.runsRange);
  protected readonly automation = this.api.watchAutomation();
  protected readonly planned = this.api.watchPlannedOutages();

  private readonly readBack = lightReadBack(async () => {
    await Promise.all([
      this.charge.refresh(),
      this.runs.refresh(),
      this.planned.refresh(),
      this.automation.refresh(),
    ]);
  });

  protected readonly TARGET = CHARGE_TARGET;
  protected readonly POWER = AUTOMATION_POWER;
  protected readonly MARGIN = AUTOMATION_MARGIN;
  protected readonly WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };
  protected readonly ONE: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };
  protected readonly describe = describeEnergyError;
  protected readonly numberOf = numberOf;
  protected readonly runStateLabel = runStateLabel;
  protected readonly runSourceLabel = runSourceLabel;
  protected readonly runEndLabel = runEndLabel;
  protected readonly outageKindLabel = outageKindLabel;
  protected readonly outageScopeLabel = outageScopeLabel;
  protected readonly automationApplies = automationApplies;

  // the charge
  protected readonly run = computed(() => {
    const state = this.charge.value();
    return state?.active === true ? state.run : undefined;
  });
  protected readonly goingOn = computed(() => runGoingOn(this.run()));
  protected readonly target = signal(String(CHARGE_TARGET.max));
  protected readonly until = signal('');
  protected readonly chargeTried = signal(false);
  protected readonly chargeBusy = signal(false);
  protected readonly chargeFailure = signal<Failure | undefined>(undefined);
  /** The command asked about in the window over the page; sent only once it is confirmed. */
  protected readonly question = signal<'start' | 'cancel' | undefined>(undefined);
  private questionDialog?: MatDialogRef<ConfirmDialog, boolean>;
  private destroyed = false;
  protected readonly targetValid = computed(() => within(wholeOf(this.target()), CHARGE_TARGET));
  protected readonly untilValue = computed(() =>
    untilOf(this.until(), this.ticker.now(), this.zone),
  );

  // the automation
  protected readonly autoOn = signal(false);
  protected readonly autoTarget = signal('');
  protected readonly autoPower = signal('');
  protected readonly autoMargin = signal('');
  /** The form follows the answer until it is changed; a save or a reset lets it follow again. */
  protected readonly autoEdited = signal(false);
  protected readonly autoTried = signal(false);
  protected readonly autoBusy = signal(false);
  protected readonly autoFailure = signal<Failure | undefined>(undefined);
  protected readonly autoProblems = computed(() => ({
    target: !within(wholeOf(this.autoTarget()), CHARGE_TARGET),
    power: !within(decimalOf(this.autoPower()), AUTOMATION_POWER),
    margin: !within(wholeOf(this.autoMargin()), AUTOMATION_MARGIN),
  }));
  protected readonly autoValid = computed(() => {
    const problems = this.autoProblems();
    return !problems.target && !problems.power && !problems.margin;
  });

  // the planned outages
  protected readonly skipBusy = signal<number | undefined>(undefined);
  protected readonly skipFailure = signal<Failure | undefined>(undefined);
  protected readonly outages = computed(() => {
    const answer: unknown = this.planned.value();
    return Array.isArray(answer) ? (answer as PlannedOutage[]) : undefined;
  });
  protected readonly runList = computed(() => {
    const answer: unknown = this.runs.value()?.answer;
    return Array.isArray(answer)
      ? [...(answer as ChargeRun[])].sort((a, b) =>
          String(b?.requestedAt).localeCompare(String(a?.requestedAt)),
        )
      : undefined;
  });

  constructor() {
    // the form of the automation shows what the service stored, until it is changed here
    effect(() => {
      const stored = this.automation.value();
      if (stored && !untracked(this.autoEdited)) {
        this.autoOn.set(stored.chargeBeforeOutage === true);
        this.autoTarget.set(numberOf(stored.targetSoc)?.toString() ?? '');
        this.autoPower.set(numberOf(stored.chargePowerKw)?.toString() ?? '');
        this.autoMargin.set(numberOf(stored.marginMinutes)?.toString() ?? '');
      }
    });
    // a question with nothing left to ask goes for good, the window closed with no answer: the start once a
    // charge goes on (the automation began one), the cancel once the charge it was asked about is over
    effect(() => {
      const asked = this.question();
      const goingOn = this.goingOn();
      if ((asked === 'start' && goingOn) || (asked === 'cancel' && !goingOn)) {
        this.questionDialog?.close(false);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.questionDialog?.close(false);
    });
  }

  protected textOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  /** The form checked first; a valid charge asked about in the window, sent only for yes. */
  protected start(): void {
    this.chargeTried.set(true);
    if (!this.targetValid() || this.untilValue() === 'invalid' || this.chargeBusy()) {
      return;
    }
    this.ask('start', () => this.sendStart());
  }

  private sendStart(): void {
    const until = this.untilValue();
    if (!this.targetValid() || until === 'invalid' || this.chargeBusy()) {
      return;
    }
    this.send(
      this.api.startCharge({
        targetSoc: wholeOf(this.target()) ?? CHARGE_TARGET.max,
        until: until.until,
      }),
      'energy.charge.startFailed',
      this.chargeBusy,
      this.chargeFailure,
      () => {
        this.chargeTried.set(false);
        this.until.set('');
      },
    );
  }

  /** The cancel: at once for a charge of the dashboard, after the question for one of the automation. */
  protected cancel(): void {
    if (this.run()?.source === 'automation') {
      this.ask('cancel', () => this.sendCancel());
    } else {
      this.sendCancel();
    }
  }

  private sendCancel(): void {
    if (this.chargeBusy() || !this.goingOn()) {
      return;
    }
    this.send(
      this.api.cancelCharge(),
      'energy.charge.cancelFailed',
      this.chargeBusy,
      this.chargeFailure,
    );
  }

  /** The question in a window over the page (`ConfirmDialog`), the safe answer focused. */
  private ask(command: 'start' | 'cancel', confirmed: () => void): void {
    if (this.question() !== undefined || this.chargeBusy()) {
      return;
    }
    const start = command === 'start';
    this.question.set(command);
    this.questionDialog = this.dialog.open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, {
      ...CONFIRM_DIALOG_SIZE,
      data: {
        icon: start ? 'bolt' : 'stop',
        title: start ? 'energy.charge.start' : 'energy.charge.cancel',
        question: start ? 'energy.charge.startQuestion' : 'energy.charge.cancelQuestion',
        confirm: start ? 'energy.charge.start' : 'energy.charge.cancel',
        cancel: start ? 'energy.charge.dontStart' : 'energy.charge.keep',
        testId: 'charge-question',
      },
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
    this.questionDialog.afterClosed().subscribe((answer) => {
      this.questionDialog = undefined;
      this.question.set(undefined);
      if (answer === true && !this.destroyed) {
        confirmed();
      }
    });
  }

  protected editAuto(change: () => void): void {
    this.autoEdited.set(true);
    change();
  }

  protected saveAutomation(): void {
    this.autoTried.set(true);
    if (!this.autoValid() || this.autoBusy()) {
      return;
    }
    this.send(
      this.api.saveAutomation({
        chargeBeforeOutage: this.autoOn(),
        targetSoc: wholeOf(this.autoTarget()) ?? CHARGE_TARGET.max,
        chargePowerKw: decimalOf(this.autoPower()) ?? AUTOMATION_POWER.max,
        marginMinutes: wholeOf(this.autoMargin()) ?? 0,
      }),
      'energy.automation.saveFailed',
      this.autoBusy,
      this.autoFailure,
      () => this.resetAutomation(),
    );
  }

  /** The form back to what the service stored. */
  protected resetAutomation(): void {
    this.autoEdited.set(false);
    this.autoTried.set(false);
    const stored = this.automation.value();
    this.autoOn.set(stored?.chargeBeforeOutage === true);
    this.autoTarget.set(numberOf(stored?.targetSoc)?.toString() ?? '');
    this.autoPower.set(numberOf(stored?.chargePowerKw)?.toString() ?? '');
    this.autoMargin.set(numberOf(stored?.marginMinutes)?.toString() ?? '');
  }

  protected skip(outage: PlannedOutage, skip: boolean): void {
    if (outage.id === undefined || this.skipBusy() !== undefined) {
      return;
    }
    const id = outage.id;
    this.skipBusy.set(id);
    this.skipFailure.set(undefined);
    const after = (failure?: Failure) =>
      void this.readBack()
        .catch(() => undefined)
        .then(() => {
          this.skipBusy.set(undefined);
          this.skipFailure.set(failure);
        });
    this.api.skipOutage(id, skip).subscribe({
      error: (error: unknown) =>
        after({ summary: 'energy.planned.skipFailed', error: toApiError(error) }),
      complete: () => after(),
    });
  }

  /**
   * One write, then the cards read again whatever it came to - a write without an answer may have
   * been carried out. Never aborted with the page.
   */
  private send(
    write: Observable<void>,
    summary: MessageKey,
    busy: ReturnType<typeof signal<boolean>>,
    failure: ReturnType<typeof signal<Failure | undefined>>,
    done?: () => void,
  ): void {
    busy.set(true);
    failure.set(undefined);
    const after = (failed?: Failure) =>
      void this.readBack()
        .catch(() => undefined)
        .then(() => {
          busy.set(false);
          if (failed) {
            failure.set(failed);
          } else {
            done?.();
          }
        });
    write.subscribe({
      error: (error: unknown) => {
        const failed = toApiError(error);
        after({
          summary: failed.kind === 'network' ? 'energy.charge.noAnswer' : summary,
          error: failed,
        });
      },
      complete: () => after(),
    });
  }
}
