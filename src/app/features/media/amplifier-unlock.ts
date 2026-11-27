import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { DeviceCommands } from '../../core/api/device-commands';
import { APP_CONFIG } from '../../core/config/app-config';
import { ProfileStore } from '../../core/profile/profile-store';
import { houseDateTimeAt } from '../../core/time/house-date-time';
import { MediaApi } from '../../data-access/media/media-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import {
  CONFIRM_DIALOG_SIZE,
  ConfirmData,
  ConfirmDialog,
} from '../../shared/confirm-dialog/confirm-dialog';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { describeUnlockError } from './amplifier-labels';

/** The one key of the commands of the card. */
const AMPLIFIER = 'amplifier';

/**
 * The unlock of the amplifier (HAS-517, epic HAS-508), as a card in the look of the switch of the heating of the
 * house (`HeatingSwitch`, owner 2026-11-27: the page of the amplifier is the page of the heating over again). "Unlock
 * the amplifier" in the bottom right corner asks first in a window over the page ("Do not unlock" focused), then sends
 * `POST /media/amplifier/unlock` once with the member of the profile; disabled while the question is open and while
 * the unlock is on its way, so one press is one unlock.
 *
 * **The outcome is the answer of the `POST` itself**: the amplifier has no state anyone can read, so nothing is
 * polled, nothing read back and no freshness told. Never pressed by itself - the unlock is the member's.
 */
@Component({
  selector: 'app-amplifier-unlock',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    HouseDateTimePipe,
  ],
  template: `
    <ng-container *transloco="let t">
      <mat-card appearance="outlined" class="amplifier card--domain" data-testid="amplifier">
        <mat-card-header>
          <div mat-card-avatar class="domain-badge"><mat-icon>speaker</mat-icon></div>
          <mat-card-title>{{ t('amplifier.title') }}</mat-card-title>
        </mat-card-header>

        <mat-card-content>
          <p class="amplifier__detail">{{ t('amplifier.lead') }}</p>

          @if (sending()) {
            <mat-progress-bar
              class="amplifier__progress"
              mode="indeterminate"
              data-testid="amplifier-sending"
              [attr.aria-label]="t('amplifier.sending')"
            />
          } @else if (sent()) {
            <p class="amplifier__state" role="status" data-testid="amplifier-sent">
              <mat-icon>check_circle</mat-icon>
              {{ t('amplifier.sent') }}
            </p>
          }
          <app-api-error-strip
            data-testid="amplifier-failure"
            [error]="failure()"
            [describeWith]="describeUnlockError"
          />
          <!-- when it was pressed: an outcome left on an open page for days is never read as news -->
          @if (outcomeAt(); as at) {
            <p class="amplifier__when" data-testid="amplifier-when">
              {{ t('amplifier.at', { time: at | houseDateTime }) }}
            </p>
          }

          <!-- the command in the bottom right corner, as the switch of the heating; disabled and still focusable
               while its question is open or the unlock is on its way -->
          <div class="amplifier__commands">
            <button
              matButton="outlined"
              type="button"
              data-testid="amplifier-unlock"
              disabledInteractive
              [disabled]="member() === undefined || sending() || asking()"
              (click)="ask()"
            >
              <mat-icon>lock_open</mat-icon>
              {{ t('amplifier.unlock') }}
            </button>
          </div>
        </mat-card-content>
      </mat-card>
    </ng-container>
  `,
  styles: `
    :host {
      display: block;
    }

    .amplifier {
      --app-domain: var(--app-domain-household);
      height: 100%;
      box-sizing: border-box;
    }

    // the measures of the switch of the heating (heating-switch.scss), so the two pages look alike
    mat-card-header {
      padding: 12px 12px 0;
    }

    mat-card-content {
      display: flex;
      flex: 1;
      flex-direction: column;
      padding: 8px 12px 12px;
    }

    .amplifier__detail {
      margin: 4px 0 0;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    .amplifier__state {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 12px 0 0;
      font: var(--mat-sys-title-medium);
      color: var(--mat-sys-on-surface);
    }

    .amplifier__when {
      margin: 8px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }

    .amplifier__progress {
      margin-top: 12px;
    }

    .amplifier__commands {
      display: flex;
      justify-content: flex-end;
      margin-top: auto;
      padding-top: 12px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AmplifierUnlock {
  private readonly api = inject(MediaApi);
  private readonly profile = inject(ProfileStore).profile;
  private readonly dialog = inject(MatDialog);
  private readonly timeZone = inject(APP_CONFIG).houseTimeZone;
  private readonly commands = new DeviceCommands<string>();
  private questionDialog?: MatDialogRef<ConfirmDialog, boolean>;
  private destroyed = false;

  protected readonly describeUnlockError = describeUnlockError;
  protected readonly member = computed(() => this.profile()?.name);
  private readonly state = computed(() => this.commands.stateOf(AMPLIFIER));
  protected readonly sending = computed(() => this.state()?.sending === true);
  protected readonly sent = computed(() => this.state()?.sent === true);
  protected readonly failure = computed(() => this.state()?.error);
  /** When the last unlock came to its outcome, as a time of the house; `undefined` before one or while it is sent. */
  protected readonly outcomeAt = computed(() => {
    const at = this.state()?.at;
    return at === undefined || this.sending() ? undefined : houseDateTimeAt(at, this.timeZone);
  });

  private readonly question = signal(false);
  protected readonly asking = this.question.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.questionDialog?.close();
    });
  }

  /** Asks in a window over the page, "Do not unlock" focused; the unlock is sent only for the answer yes. */
  protected ask(): void {
    const asked = this.member();
    if (asked === undefined || this.sending() || this.question()) {
      return;
    }
    this.question.set(true);
    this.questionDialog = this.dialog.open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, {
      ...CONFIRM_DIALOG_SIZE,
      data: {
        icon: 'speaker',
        title: 'amplifier.unlock',
        question: 'amplifier.question',
        confirm: 'amplifier.confirm',
        cancel: 'amplifier.cancel',
        testId: 'amplifier-question',
      },
      // the first tabbable element - the one marked cdkFocusInitial, the safe answer
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
    this.questionDialog.afterClosed().subscribe((confirmed) => {
      this.questionDialog = undefined;
      this.question.set(false);
      // a question asked for one member is never sent for another the profile changed to meanwhile
      if (confirmed === true && this.member() === asked && !this.destroyed) {
        this.commands.send(AMPLIFIER, this.api.unlockAmplifier(asked));
      }
    });
  }
}
