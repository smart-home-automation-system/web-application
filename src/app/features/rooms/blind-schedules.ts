import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { BlindsApi } from '../../data-access/blinds/blinds-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { runOutcomeLabel, scheduleActionLabel, scheduleDecisionLabel } from './room-labels';

/**
 * The schedules that move one blind and what each makes of today (HAS-232,
 * `GET /blinds/{id}/schedules`): its window, what it does in this minute, and whether it ran for
 * this blind - moved, or held back by the pause. Made anew for every blind, so its answer is
 * never shown under another.
 */
@Component({
  selector: 'app-blind-schedules',
  imports: [TranslocoDirective, ApiErrorStrip, HouseDateTimePipe],
  template: `
    <ng-container *transloco="let t">
      @let list = schedules.value();
      <app-api-error-strip [error]="schedules.error()" />
      @if (list === undefined) {
        @if (!schedules.error()) {
          <p class="schedules__note">{{ t('rooms.schedules.loading') }}</p>
        }
      } @else if (list === null || list.length === 0) {
        <p class="schedules__note" data-testid="no-schedules">{{ t('rooms.schedules.none') }}</p>
      } @else {
        <ul class="schedules" data-testid="blind-schedules">
          @for (schedule of list; track $index) {
            <li class="schedule" [class.schedule--off]="schedule.enabled === false">
              <span class="schedule__name">{{
                schedule.name ?? t('rooms.schedules.unnamed')
              }}</span>
              <span class="schedule__what">
                @let action = actionLabel(schedule.action);
                {{ action ? t(action) : schedule.action }}
                @if (schedule.action === 'position' && schedule.position !== undefined) {
                  {{ schedule.position }}&nbsp;%
                }
                @if (schedule.window; as window) {
                  · {{ window.from }}–{{ window.to }}
                  @if (window.nextDay) {
                    {{ t('rooms.schedules.nextDay') }}
                  }
                }
              </span>
              <span class="schedule__state">
                @if (schedule.enabled === false) {
                  {{ t('rooms.schedules.disabled') }}
                } @else if (schedule.firedAt) {
                  @let outcome = outcomeLabel(schedule.outcome);
                  {{ outcome ? t(outcome) : schedule.outcome }}
                  {{ schedule.firedAt | houseDateTime }}
                } @else {
                  @let decision = decisionLabel(schedule.decision);
                  {{ decision ? t(decision) : schedule.decision }}
                }
              </span>
            </li>
          }
        </ul>
      }
    </ng-container>
  `,
  styles: `
    .schedules {
      display: grid;
      gap: 4px;
      margin: 4px 0 0;
      padding: 0;
      list-style: none;
    }

    .schedule {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      column-gap: 8px;
      font: var(--mat-sys-body-small);
      letter-spacing: var(--mat-sys-body-small-tracking);
    }

    .schedule__name {
      font-weight: 600;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .schedule__what,
    .schedule__state {
      color: var(--mat-sys-on-surface-variant);
    }

    .schedule__state {
      grid-column: 2;
      grid-row: 1 / span 2;
      align-self: center;
      text-align: end;
    }

    .schedule--off {
      opacity: 0.6;
    }

    .schedules__note {
      margin: 4px 0 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
})
export class BlindSchedules {
  /** The id of the blind in the registry. */
  readonly blind = input.required<number>();

  protected readonly schedules = inject(BlindsApi).watchSchedules(() => this.blind());
  protected readonly actionLabel = scheduleActionLabel;
  protected readonly outcomeLabel = runOutcomeLabel;
  protected readonly decisionLabel = scheduleDecisionLabel;
}
