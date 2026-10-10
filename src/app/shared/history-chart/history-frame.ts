import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  contentChild,
  input,
  model,
} from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { ApiError } from '../../core/api/api-error';
import { HISTORY_PRESETS, HistoryPreset } from '../../core/time/history-range';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../api-error/api-error-strip';
import { DataFreshness } from '../data-freshness/data-freshness';

const PRESET_LABELS: Readonly<Record<HistoryPreset, MessageKey>> = {
  day: 'history.preset.day',
  week: 'history.preset.week',
  month: 'history.preset.month',
};

/**
 * What every history has around its chart: the choice of the period, the bar while the answer
 * for that period is awaited, the words for a period without a reading, the failure of the call
 * and its freshness. The chart itself, and whatever is said next to it, is the content -
 * **given as a template**: `<app-history-frame …><ng-template>…</ng-template></app-history-frame>`.
 * Plain content would be made the moment the frame is, shown or not, and a chart made while the
 * frame shows its progress bar is a chart drawn into nothing.
 *
 * It decides nothing about the data - the caller says whether it waits and whether there is
 * anything to draw - so the two histories cannot come to tell these states differently.
 */
@Component({
  selector: 'app-history-frame',
  imports: [
    NgTemplateOutlet,
    MatButtonToggleModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
  ],
  template: `
    <ng-container *transloco="let t">
      <div class="frame__head">
        <mat-button-toggle-group
          hideSingleSelectionIndicator
          [attr.aria-label]="t('history.preset.choose')"
          [value]="preset()"
          (change)="preset.set($event.value)"
        >
          @for (option of presets; track option) {
            <mat-button-toggle [value]="option">{{ t(labels[option]) }}</mat-button-toggle>
          }
        </mat-button-toggle-group>
        @if (!waiting()) {
          <app-data-freshness
            class="frame__freshness"
            [lastUpdated]="lastUpdated()"
            [stale]="stale()"
          />
        }
      </div>

      @if (waiting()) {
        <mat-progress-bar mode="indeterminate" [attr.aria-label]="t('history.loading')" />
      } @else {
        @if (!empty()) {
          <ng-container [ngTemplateOutlet]="content()" />
        } @else if (!error()) {
          <p class="frame__note" data-testid="history-empty">{{ t('history.empty') }}</p>
        }
        <app-api-error-strip [error]="error()" />
      }
    </ng-container>
  `,
  styleUrl: './history-frame.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryFrame {
  readonly preset = model.required<HistoryPreset>();
  /** The answer for the period on screen has not arrived, one way or the other. */
  readonly waiting = input.required<boolean>();
  /** There is nothing to draw for the period: no answer, or one without a reading. */
  readonly empty = input.required<boolean>();
  readonly error = input.required<ApiError | undefined>();
  readonly lastUpdated = input.required<number | undefined>();
  readonly stale = input.required<boolean>();

  /** What is shown once there is something to draw; made then, and removed when there is not. */
  protected readonly content = contentChild.required(TemplateRef);

  protected readonly presets = HISTORY_PRESETS;
  protected readonly labels = PRESET_LABELS;
}
