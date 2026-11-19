import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { GarageAlert, GarageGate } from '../../data-access/gate/gate-api';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { alertText, isWarning } from '../../shared/gate/gate-labels';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';

/**
 * The open alarms and warnings of the garage gates (HAS-454, `GET /gate/garage/alerts` of `gate-service` >= 0.10.0,
 * the episodes of HAS-475): cold and the empty house are alarms, open for long a warning; each with its gate, since
 * when it stands open and how often the household was told again. The service judges them - nothing is computed
 * here from the state of a gate.
 */
@Component({
  selector: 'app-gate-alerts',
  imports: [MatCardModule, MatIconModule, TranslocoDirective, DisplayTextPipe, HouseDateTimePipe],
  template: `
    <ng-container *transloco="let t">
      <mat-card appearance="outlined" class="alerts card--domain" data-testid="gate-alerts">
        <mat-card-header>
          <div mat-card-avatar class="domain-badge"><mat-icon>notifications_active</mat-icon></div>
          <mat-card-title>{{ t('gate.alert.title') }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @if (shown(); as list) {
            @if (list.length === 0) {
              <p class="note" data-testid="alerts-none">{{ t('gate.alert.none') }}</p>
            } @else {
              <ul class="alerts__list">
                @for (alert of list; track $index) {
                  <li
                    class="alert"
                    data-testid="gate-alert"
                    [attr.data-level]="isWarning(alert) ? 'warning' : 'alarm'"
                  >
                    <span class="alert__level">{{
                      t(isWarning(alert) ? 'gate.alert.warning' : 'gate.alert.alarm')
                    }}</span>
                    <span class="alert__what"
                      >{{ nameOf(alert) }}: {{ alertText(alert) | displayText }}</span
                    >
                    <span class="alert__since">
                      @if (alert.openSince; as since) {
                        {{ t('gate.alert.openSince') }}&ngsp;{{ since | houseDateTime }}
                      }
                      @if (alert.reminders !== undefined && alert.reminders > 0) {
                        &ngsp;· {{ t('gate.alert.reminders', { count: alert.reminders }) }}
                      }
                    </span>
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
export class GateAlerts {
  /** What `gate-service` last answered; `undefined` until the first answer. */
  readonly alerts = input.required<readonly GarageAlert[] | null | undefined>();
  /** The garage gates, to name a gate the alarm left unnamed. */
  readonly garages = input.required<readonly GarageGate[] | null | undefined>();

  protected readonly alertText = alertText;
  protected readonly isWarning = isWarning;

  protected readonly shown = computed(() => {
    const answer = this.alerts();
    if (answer === undefined) {
      return undefined;
    }
    return Array.isArray(answer) ? answer : [];
  });

  protected nameOf(alert: GarageAlert): string {
    const known = (this.garages() ?? []).find((gate) => gate.id === alert.gate)?.name;
    return alert.name ?? known ?? `#${alert.gate ?? '?'}`;
  }
}
