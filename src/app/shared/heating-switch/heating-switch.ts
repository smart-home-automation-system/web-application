import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { FailedSwitch, HeatingSwitchControl } from '../../data-access/heating/heating-api';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../api-error/api-error-strip';
import { CONFIRM_DIALOG_SIZE, ConfirmData, ConfirmDialog } from '../confirm-dialog/confirm-dialog';
import { DataFreshness } from '../data-freshness/data-freshness';
import { HouseDateTimePipe } from '../house-date-time/house-date-time.pipe';

/**
 * The switch of the heating system, as a card: whether the heating of the whole house is on,
 * since when, and a button to change it. The view that shows it owns the data -
 * `<app-heating-switch [control]="heating" />` with `heating = inject(HeatingApi).watchSwitch()`.
 *
 * **The button asks before it acts**, in a window over the page (`ConfirmDialog`, HAS-438, owner
 * 2026-11-13 - the rule of every question of the house), "Cancel" focused; the button stands in the
 * bottom right corner of the card and is disabled while its question is open.
 *
 * **What the card says is what the service answered, never what was clicked.** A change is sent,
 * the service is asked again, and only that answer moves the state on screen; a change that
 * failed is reported and the state is the one the service gives.
 */
@Component({
  selector: 'app-heating-switch',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    HouseDateTimePipe,
  ],
  templateUrl: './heating-switch.html',
  styleUrl: './heating-switch.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeatingSwitch {
  readonly control = input.required<HeatingSwitchControl>();

  private readonly dialog = inject(MatDialog);
  private questionDialog?: MatDialogRef<ConfirmDialog, boolean>;
  private destroyed = false;

  /** True, false, or `undefined` while the answer does not say. */
  protected readonly enabled = computed(() => {
    const enabled: unknown = this.control().value()?.isHeatingEnabled;
    return typeof enabled === 'boolean' ? enabled : undefined;
  });

  protected readonly since = computed(() => {
    const updatedAt: unknown = this.control().value()?.updatedAt;
    return typeof updatedAt === 'string' ? updatedAt : undefined;
  });

  /** The state somebody asked for with the button and has not confirmed yet. */
  private readonly asked = signal<boolean | undefined>(undefined);

  /** The change the question open over the page is about. */
  protected readonly question = this.asked.asReadonly();

  /**
   * A change that failed, for as long as it says something: once the house is in the state that
   * was asked for - the change got through after all, or somebody else made it - there is no
   * failure left to tell.
   */
  protected readonly failure = computed(() => {
    const failed = this.control().switchFailure();
    return failed !== undefined && failed.on !== this.enabled() ? failed : undefined;
  });

  constructor() {
    // A question is about leaving the state on screen. When that state goes - somebody else
    // switched in the meantime, or the service stopped saying - the question goes for good, its
    // window closed with no answer: it must not come back by itself when the house returns.
    effect(() => {
      const asked = this.asked();
      if (asked !== undefined && this.enabled() !== !asked) {
        this.asked.set(undefined);
        this.questionDialog?.close();
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.questionDialog?.close();
    });
  }

  /**
   * What to say about a failed change. A change that got no answer may have been carried out
   * all the same - or may still be: that is not "could not be switched".
   */
  protected failureText(failed: FailedSwitch): MessageKey {
    if (failed.error.kind === 'network') {
      return 'heatingSwitch.noAnswer';
    }
    return failed.on ? 'heatingSwitch.failedOn' : 'heatingSwitch.failedOff';
  }

  /** Asks in a window over the page, "Cancel" focused; the change is sent only for the answer yes. */
  protected ask(on: boolean): void {
    if (this.control().switching() || this.asked() !== undefined) {
      return;
    }
    this.asked.set(on);
    this.questionDialog = this.dialog.open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, {
      ...CONFIRM_DIALOG_SIZE,
      data: {
        icon: 'power_settings_new',
        title: on ? 'heatingSwitch.turnOn' : 'heatingSwitch.turnOff',
        question: on ? 'heatingSwitch.confirmOn' : 'heatingSwitch.confirmOff',
        confirm: on ? 'heatingSwitch.turnOn' : 'heatingSwitch.turnOff',
        cancel: 'heatingSwitch.cancel',
        testId: 'heating-switch-question',
      },
      // the first tabbable element - the one marked cdkFocusInitial, the cancel
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
    this.questionDialog.afterClosed().subscribe((confirmed) => {
      this.questionDialog = undefined;
      // a question the effect took back has nothing left to send
      const still = this.asked() === on;
      this.asked.set(undefined);
      if (confirmed === true && still && !this.destroyed) {
        this.control().turn(on);
      }
    });
  }
}
