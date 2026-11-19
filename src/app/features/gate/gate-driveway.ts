import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { DeviceCommands } from '../../core/api/device-commands';
import { ProfileStore } from '../../core/profile/profile-store';
import { GateApi, GateRead } from '../../data-access/gate/gate-api';
import { MessageKey } from '../../i18n/messages';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { gateFailureOf, openingSourceText } from '../../shared/gate/gate-labels';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';

/** The key of the driveway gate among the commands of the page. */
const DRIVEWAY = 'driveway';

const BRIDGE_LABELS: Readonly<Record<'online' | 'offline' | 'unknown', MessageKey>> = {
  online: 'gate.station.online',
  offline: 'gate.station.offline',
  unknown: 'gate.station.unknown',
};

/**
 * The driveway gate (HAS-449, HAS-454): "Open the gate" sends `POST /gate/open` at once, with no question (owner,
 * 2026-11-16 - as the button of the indoor screen), the member of the profile with it, then the gate is read again;
 * whether its Shelly answers and is safe to command, the last opening and who made it, the last ring and the door
 * station. No picture - the station gives none (HAS-444). A part `gate-service` leaves out is not known, never off.
 */
@Component({
  selector: 'app-gate-driveway',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    TranslocoDirective,
    DisplayTextPipe,
    HouseDateTimePipe,
  ],
  template: `
    <ng-container *transloco="let t">
      <mat-card appearance="outlined" class="driveway card--domain" data-testid="gate-driveway">
        <mat-card-header>
          <div mat-card-avatar class="domain-badge"><mat-icon>fence</mat-icon></div>
          <mat-card-title>{{ t('gate.driveway.title') }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @if (read(); as answer) {
            <dl class="facts">
              <div>
                <dt>{{ t('gate.driveway.lastOpening') }}</dt>
                <dd data-testid="gate-last-opening">
                  @if (answer.lastOpening?.at; as at) {
                    {{ at | houseDateTime }}&ngsp;{{
                      openingSourceText(answer.lastOpening?.source) | displayText
                    }}
                    @if (answer.lastOpening?.member; as member) {
                      &ngsp;· {{ member }}
                    }
                  } @else {
                    {{ t('gate.driveway.never') }}
                  }
                </dd>
              </div>
              <div>
                <dt>{{ t('gate.driveway.lastRing') }}</dt>
                <dd data-testid="gate-last-ring">
                  @if (answer.lastRing?.at; as at) {
                    {{ at | houseDateTime }}
                  } @else {
                    {{ t('gate.driveway.never') }}
                  }
                </dd>
              </div>
              <div>
                <dt>{{ t('gate.station.bridge') }}</dt>
                <dd data-testid="gate-bridge" [attr.data-state]="bridgeState()">
                  {{ t(bridgeKey()) }}
                </dd>
              </div>
            </dl>
            @if (answer.gate === undefined) {
              <p class="note">{{ t('gate.driveway.notRead') }}</p>
            } @else if (answer.gate.reachable === false) {
              <p class="warning" data-testid="gate-not-reachable">
                {{ t('gate.driveway.notReachable') }}
              </p>
            } @else if (answer.gate.safe === false) {
              <p class="warning" data-testid="gate-not-safe">{{ t('gate.driveway.notSafe') }}</p>
            }
          }
          <div class="actions">
            <button
              mat-flat-button
              type="button"
              data-testid="gate-open"
              [disabled]="member() === undefined"
              (click)="open()"
            >
              <mat-icon>lock_open</mat-icon>
              {{ t('gate.driveway.open') }}
            </button>
          </div>
          @if (command(); as state) {
            @if (state.error) {
              <p class="failure" role="alert" data-testid="gate-open-failure">
                {{ gateFailureOf(state) | displayText }}
              </p>
            } @else if (state.sent) {
              <p class="note" role="status" data-testid="gate-open-sent">
                {{ t('gate.driveway.sent') }}
              </p>
            }
          }
        </mat-card-content>
      </mat-card>
    </ng-container>
  `,
  styleUrl: './gate-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GateDriveway {
  private readonly api = inject(GateApi);
  private readonly profile = inject(ProfileStore).profile;

  /** What `gate-service` last answered; `undefined` until the first answer. */
  readonly read = input.required<GateRead | null | undefined>();
  readonly commands = input.required<DeviceCommands<string | number>>();
  readonly refresh = input.required<() => Promise<void>>();

  protected readonly member = computed(() => this.profile()?.name);
  protected readonly command = computed(() => this.commands().stateOf(DRIVEWAY));

  protected readonly bridgeState = computed(() => {
    const online = this.read()?.bridge?.online;
    return online === undefined ? 'unknown' : online ? 'online' : 'offline';
  });
  protected readonly bridgeKey = computed(() => BRIDGE_LABELS[this.bridgeState()]);

  protected readonly openingSourceText = openingSourceText;
  protected readonly gateFailureOf = gateFailureOf;

  protected open(): void {
    const member = this.member();
    if (member === undefined) {
      return;
    }
    this.commands().send(DRIVEWAY, this.api.open(member), this.refresh());
  }
}
