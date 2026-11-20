import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { SafetyApi, SafetyRun } from '../../data-access/safety/safety-api';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { HistoryFrame } from '../../shared/history-chart/history-frame';
import { historyPeriod, shownHistory } from '../../shared/history-chart/history-period';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { describeSafetyError, reactionText } from '../../shared/safety/safety-labels';
import { SAFETY_PRESETS } from './safety-alarms';

/** How many items are shown at first, and added by every "Show more". */
const PAGE = 5;

/**
 * The reactions the automation sent during an alarm, of 7 or 30 days (HAS-468, `GET /safety/automation/runs` of
 * safety-service >= 0.5.0), the newest first: when, which reaction in our words, what it was sent to and how it ended -
 * the target and the outcome are the service's words, printed as they come.
 */
@Component({
  selector: 'app-safety-runs',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    TranslocoDirective,
    DisplayTextPipe,
    HistoryFrame,
    HouseDateTimePipe,
  ],
  template: `
    <ng-container *transloco="let t">
      <mat-card appearance="outlined" class="card--domain" data-testid="safety-runs">
        <mat-card-header>
          <div mat-card-avatar class="domain-badge"><mat-icon>history</mat-icon></div>
          <mat-card-title>{{ t('safety.automation.runs') }}</mat-card-title>
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
                @if (runs().length === 0) {
                  <p class="note" data-testid="runs-none">{{ t('safety.automation.runsNone') }}</p>
                } @else {
                  <ol class="history">
                    @for (run of visible(); track $index) {
                      <li class="history__item" data-testid="safety-run">
                        <span class="history__time">{{ run.sentAt | houseDateTime }}</span>
                        <span class="history__what">
                          {{ reactionOf(run) | displayText }}
                          @if (run.target; as target) {
                            &ngsp;· {{ target }}
                          }
                        </span>
                        <span class="history__state">{{ run.outcome ?? '' }}</span>
                      </li>
                    }
                  </ol>
                  <!-- the newest five, five more with every press; the row is always there, so the card keeps its height -->
                  <div class="history__more">
                    @if (runs().length > visible().length) {
                      <span class="note">{{
                        t('safety.list.shown', { shown: visible().length, total: runs().length })
                      }}</span>
                      <button mat-button type="button" data-testid="runs-more" (click)="showMore()">
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
export class SafetyRuns {
  private readonly api = inject(SafetyApi);

  protected readonly presets = SAFETY_PRESETS;
  protected readonly period = historyPeriod('month');
  protected readonly resource = this.api.watchRuns(() => this.period.range());
  protected readonly shown = shownHistory(this.resource, this.period);
  protected readonly describeError = describeSafetyError;

  /** The newest five, five more with every "Show more"; back to five with another period (owner, the preview of HAS-469). */
  private readonly count = linkedSignal({ source: this.period.preset, computation: () => PAGE });
  protected readonly visible = computed(() => this.runs().slice(0, this.count()));

  protected showMore(): void {
    this.count.update((shown) => shown + PAGE);
  }

  protected readonly runs = computed((): readonly SafetyRun[] => {
    const answer = this.shown.answer();
    return Array.isArray(answer) ? answer : [];
  });

  protected reactionOf(run: SafetyRun) {
    return reactionText(run.reaction);
  }
}
