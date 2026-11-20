import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { HistoryPreset } from '../../core/time/history-range';
import { SafetyAlarm, SafetyApi } from '../../data-access/safety/safety-api';
import { HistoryFrame } from '../../shared/history-chart/history-frame';
import { historyPeriod, shownHistory } from '../../shared/history-chart/history-period';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { describeSafetyError, detectorName } from '../../shared/safety/safety-labels';

/** The periods of the alarms: the service answers at most 30 days. */
export const SAFETY_PRESETS: readonly HistoryPreset[] = ['week', 'month'];

/** How many items are shown at first, and added by every "Show more". */
const PAGE = 5;

/**
 * The fire alarms of 7 or 30 days (HAS-469, `GET /safety/alarms` of safety-service >= 0.2.0), the newest first: when
 * each began, its room and detector (the registry's words, printed beside ours), whether it is still going on or when
 * it was over, and whether the household was told. A `queryResource` tagged with its range: a period never shows the
 * alarms of another.
 */

@Component({
  selector: 'app-safety-alarms',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    TranslocoDirective,
    HistoryFrame,
    HouseDateTimePipe,
  ],
  template: `
    <ng-container *transloco="let t">
      <mat-card appearance="outlined" class="card--domain" data-testid="safety-alarms">
        <mat-card-header>
          <div mat-card-avatar class="domain-badge"><mat-icon>local_fire_department</mat-icon></div>
          <mat-card-title>{{ t('safety.alarms.title') }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <app-history-frame
            [(preset)]="period.preset"
            [presets]="presets"
            [waiting]="shown.waiting()"
            [empty]="false"
            [error]="resource.error()"
            [describeWith]="describeError"
            [lastUpdated]="resource.lastUpdated()"
            [stale]="resource.stale()"
          >
            <ng-template>
              <div class="history-box">
                @if (alarms().length === 0) {
                  <p class="note" data-testid="alarms-none">{{ t('safety.alarms.none') }}</p>
                } @else {
                  <ol class="history">
                    @for (alarm of visible(); track $index) {
                      <li
                        class="history__item"
                        data-testid="safety-alarm"
                        [attr.data-open]="alarm.clearedAt === undefined"
                      >
                        <span class="history__time">{{ alarm.startedAt | houseDateTime }}</span>
                        <span class="history__what">
                          <!-- the room and the detector of the registry, printed as they are -->
                          <strong>{{ alarm.room ?? '?' }}</strong> · {{ nameOf(alarm) }}
                        </span>
                        <span class="history__state">
                          @if (alarm.clearedAt; as cleared) {
                            {{ t('safety.alarms.over') }}&ngsp;{{ cleared | houseDateTime }}
                          } @else {
                            <strong class="warning">{{ t('safety.alarms.going') }}</strong>
                          }
                          &ngsp;·&ngsp;{{
                            t(alarm.alarmToldAt ? 'safety.alarms.told' : 'safety.alarms.notTold')
                          }}
                        </span>
                      </li>
                    }
                  </ol>
                  <!-- the newest five, five more with every press; the row is always there, so the card keeps its height -->
                  <div class="history__more">
                    @if (alarms().length > visible().length) {
                      <span class="note">{{
                        t('safety.list.shown', { shown: visible().length, total: alarms().length })
                      }}</span>
                      <button
                        mat-button
                        type="button"
                        data-testid="alarms-more"
                        (click)="showMore()"
                      >
                        {{ t('safety.list.more') }}
                      </button>
                    }
                  </div>
                }
              </div>
            </ng-template>
          </app-history-frame>
        </mat-card-content>
      </mat-card>
    </ng-container>
  `,
  styleUrl: './safety-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SafetyAlarms {
  private readonly api = inject(SafetyApi);

  protected readonly presets = SAFETY_PRESETS;
  protected readonly period = historyPeriod('month');
  protected readonly resource = this.api.watchAlarms(() => this.period.range());
  protected readonly shown = shownHistory(this.resource, this.period);
  protected readonly describeError = describeSafetyError;

  /** The newest five, five more with every "Show more"; back to five with another period (owner, the preview of HAS-469). */
  private readonly count = linkedSignal({ source: this.period.preset, computation: () => PAGE });
  protected readonly visible = computed(() => this.alarms().slice(0, this.count()));

  protected showMore(): void {
    this.count.update((shown) => shown + PAGE);
  }

  protected readonly alarms = computed((): readonly SafetyAlarm[] => {
    const answer = this.shown.answer();
    return Array.isArray(answer) ? answer : [];
  });

  protected nameOf(alarm: SafetyAlarm): string {
    return detectorName({ name: alarm.name, id: alarm.detectorId });
  }
}
