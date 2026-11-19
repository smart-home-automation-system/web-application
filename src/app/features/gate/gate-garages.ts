import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { DeviceCommands } from '../../core/api/device-commands';
import { APP_CONFIG } from '../../core/config/app-config';
import { ProfileStore } from '../../core/profile/profile-store';
import { houseInstant, parseHouseDateTime } from '../../core/time/house-date-time';
import { Ticker } from '../../core/time/ticker';
import { GarageGate, GateApi } from '../../data-access/gate/gate-api';
import { DisplayText } from '../../i18n/messages';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import {
  GARAGE_BUTTON_LABELS,
  GARAGE_STATE_LABELS,
  durationText,
  garageStateOf,
  gateFailureOf,
} from '../../shared/gate/gate-labels';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';

/**
 * The garage gates (HAS-473, HAS-474, HAS-454): each with its state and since when - "Closed since 14:20", "Open for
 * 18 min", "Not known" (a missing state is never read as closed) - and ONE button whose label follows the state:
 * "Open" when closed, "Close" when open, "Run the gate" when not known. A press sends one pulse at once, with no
 * question, and the button is never disabled after it (owner, 2026-11-18: a second press stops the gate half-way);
 * the gate is read again. "The gate did not react" while its sensor did not answer the last pulse.
 */
@Component({
  selector: 'app-gate-garages',
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
      <mat-card appearance="outlined" class="garages card--domain" data-testid="gate-garages">
        <mat-card-header>
          <div mat-card-avatar class="domain-badge"><mat-icon>garage</mat-icon></div>
          <mat-card-title>{{ t('gate.garage.title') }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @if (gates(); as list) {
            @if (list.length === 0) {
              <p class="note" data-testid="garages-none">{{ t('gate.garage.none') }}</p>
            } @else {
              <ul class="garages__list">
                @for (gate of list; track gate.id) {
                  @let state = stateOf(gate);
                  <li class="garage" [attr.data-gate]="gate.id" [attr.data-state]="state">
                    <div class="garage__head">
                      <span class="garage__name">{{ gate.name ?? '#' + gate.id }}</span>
                      <span class="garage__state" data-testid="garage-state">
                        @if (state === 'closed' && gate.since !== undefined) {
                          {{ t('gate.garage.closedSince') }}&ngsp;{{ gate.since | houseDateTime }}
                        } @else if (state === 'open' && openFor(gate); as lasted) {
                          {{ t('gate.garage.openFor') }}&ngsp;{{ lasted | displayText }}
                        } @else {
                          {{ t(STATE_LABELS[state]) }}
                        }
                      </span>
                    </div>
                    <button
                      mat-flat-button
                      type="button"
                      data-testid="garage-pulse"
                      [disabled]="member() === undefined"
                      (click)="pulse(gate)"
                    >
                      {{ t(BUTTON_LABELS[state]) }}
                    </button>
                    @if (gate.lastCommandConfirmed === false) {
                      <p class="warning" data-testid="garage-not-reacted">
                        {{ t('gate.garage.notReacted') }}
                      </p>
                    }
                    @if (gate.reachable === false) {
                      <p class="warning" data-testid="garage-not-reachable">
                        {{ t('gate.garage.notReachable') }}
                      </p>
                    } @else if (gate.safe === false) {
                      <p class="warning" data-testid="garage-not-safe">
                        {{ t('gate.garage.notSafe') }}
                      </p>
                    }
                    @if (commands().stateOf(lastPress().get(gate.id ?? -1) ?? ''); as command) {
                      @if (command.error) {
                        <p class="failure" role="alert" data-testid="garage-failure">
                          {{ gateFailureOf(command) | displayText }}
                        </p>
                      }
                    }
                  </li>
                }
              </ul>
            }
          }
        </mat-card-content>
      </mat-card>
    </ng-container>
  `,
  styleUrl: './gate-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GateGarages {
  private readonly api = inject(GateApi);
  private readonly profile = inject(ProfileStore).profile;
  private readonly ticker = inject(Ticker);
  private readonly zone = inject(APP_CONFIG).houseTimeZone;

  /** What `gate-service` last answered; `undefined` until the first answer. */
  readonly garages = input.required<readonly GarageGate[] | null | undefined>();
  readonly commands = input.required<DeviceCommands<string | number>>();
  readonly refresh = input.required<() => Promise<void>>();

  protected readonly STATE_LABELS = GARAGE_STATE_LABELS;
  protected readonly BUTTON_LABELS = GARAGE_BUTTON_LABELS;
  protected readonly stateOf = garageStateOf;
  protected readonly gateFailureOf = gateFailureOf;

  protected readonly member = computed(() => this.profile()?.name);

  /** The gates with an id, by id; `undefined` until the first answer. */
  protected readonly gates = computed(() => {
    const answer = this.garages();
    if (answer === undefined) {
      return undefined;
    }
    return Array.isArray(answer)
      ? answer.filter((gate) => gate.id !== undefined).sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
      : [];
  });

  /** How long an open gate has stood open, by the clock of the page; `undefined` without a time. */
  protected openFor(gate: GarageGate): DisplayText | undefined {
    const since = parseHouseDateTime(gate.since);
    return since === undefined
      ? undefined
      : durationText(Math.max(0, this.ticker.now() - houseInstant(since, this.zone)));
  }

  /**
   * Every press is a command of its own: `DeviceCommands` sends nothing for a device whose command is still on its
   * way, and a second press while the first one is - a slow answer, the read after it - must stop the gate all the
   * same. The card tells how the last press of each gate went.
   */
  private presses = 0;
  protected readonly lastPress = signal<ReadonlyMap<number, string>>(new Map());

  // every press is sent: no question, nothing disabled after it - a second press stops the gate half-way
  protected pulse(gate: GarageGate): void {
    const member = this.member();
    const id = gate.id;
    if (member === undefined || id === undefined) {
      return;
    }
    const press = `garage-${id}-${++this.presses}`;
    this.lastPress.update((all) => new Map(all).set(id, press));
    this.commands().send(press, this.api.pulse(id, member), this.refresh());
  }
}
