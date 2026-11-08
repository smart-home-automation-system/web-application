import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { APP_CONFIG } from '../../core/config/app-config';
import { historyRange } from '../../core/time/history-range';
import { Ticker } from '../../core/time/ticker';
import { AirconApi } from '../../data-access/aircon/aircon-api';
import { describeAirconError, modeText, sourceText } from '../../shared/aircon/aircon-labels';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';

/**
 * The changes of one unit in the last 24 hours of the house (HAS-395, `GET /aircon/{id}/runs`): when, on or
 * off with its mode and target, and who made it - the remote, the dashboard, a rule, the window, the empty
 * house, a lost grid. Made only while its card shows it, so the call is asked for one unit and only then; the
 * answer is tagged with its range (a `queryResource`), the newest first.
 */
@Component({
  selector: 'app-aircon-runs',
  imports: [
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DisplayTextPipe,
    HouseDateTimePipe,
  ],
  template: `
    <ng-container *transloco="let t">
      <app-api-error-strip [error]="runs.error()" [describeWith]="describeError" />
      @if (shown(); as list) {
        @if (list.length === 0) {
          <p class="runs__none" data-testid="runs-none">{{ t('aircon.page.runs.none') }}</p>
        } @else {
          <ol class="runs" data-testid="runs">
            @for (run of list; track $index) {
              <li class="runs__row">
                <span class="runs__time">{{ run.at | houseDateTime: TIME }}</span>
                <span
                  >{{
                    t(
                      run.power === true
                        ? 'aircon.state.on'
                        : run.power === false
                          ? 'aircon.state.off'
                          : 'aircon.state.unknown'
                    )
                  }}
                  @if (run.power === true && run.mode !== undefined) {
                    · {{ modeText(run.mode) | displayText }}
                  }
                  @if (run.power === true && run.targetTemperature !== undefined) {
                    · {{ t('aircon.target', { value: run.targetTemperature }) }}
                  }
                </span>
                <span class="runs__source">{{ sourceText(run.source) | displayText }}</span>
              </li>
            }
          </ol>
        }
      } @else if (!runs.error()) {
        <mat-progress-bar mode="indeterminate" [attr.aria-label]="t('aircon.page.runs.loading')" />
      }
    </ng-container>
  `,
  styles: `
    :host {
      display: grid;
      gap: 6px;
    }
    .runs {
      display: grid;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface);
    }
    .runs__row {
      display: grid;
      grid-template-columns: 4em 1fr auto;
      gap: 8px;
    }
    .runs__time {
      font-variant-numeric: tabular-nums;
      color: var(--mat-sys-on-surface-variant);
    }
    .runs__source {
      color: var(--mat-sys-on-surface-variant);
    }
    .runs__none {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AirconRuns {
  readonly unitId = input.required<number>();

  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly ticker = inject(Ticker);
  // the last 24 hours on a full hour of the house; the same object while it is the same range
  private readonly range = computed(() => historyRange('day', this.ticker.now(), this.zone), {
    equal: (a, b) => a.from === b.from && a.to === b.to,
  });
  protected readonly runs = inject(AirconApi).watchRuns(
    () => this.unitId(),
    () => this.range(),
  );

  protected readonly TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  protected readonly describeError = describeAirconError;
  protected readonly modeText = modeText;
  protected readonly sourceText = sourceText;

  /** The changes of the range on screen, newest first; `undefined` until its answer. */
  protected readonly shown = computed(() => {
    const answered = this.runs.value();
    const range = this.range();
    if (
      answered === undefined ||
      answered.query.from !== range.from ||
      answered.query.to !== range.to
    ) {
      return undefined;
    }
    // the newest first, whatever order the service answers in; the times are of the house, so text compares
    return Array.isArray(answered.answer)
      ? [...answered.answer].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
      : [];
  });
}
