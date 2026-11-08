import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

import { LanguageStore } from '../../core/i18n/language-store';
import { AirconApi } from '../../data-access/aircon/aircon-api';
import { MessageKey } from '../../i18n/messages';
import { describeAirconError } from '../../shared/aircon/aircon-labels';
import { ChartLine, LinePoint, summarise, toLine } from '../../shared/history-chart/chart-data';
import { HistoryChart } from '../../shared/history-chart/history-chart';
import { HistoryFrame } from '../../shared/history-chart/history-frame';
import { HistoryPreset } from '../../core/time/history-range';
import { HistoryPeriod, shownHistory } from '../../shared/history-chart/history-period';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';

/**
 * What the plugs draw when no compressor runs - the indoor units on standby, the fan alone (`aircon.plugs.
 * standby-watts` of aircon-service, HAS-390): above it a compressor runs. **A copy** - change both.
 */
export const COMPRESSOR_STANDBY_WATTS = 20;

/** The periods of the chart: the samples endpoint answers at most two days in buckets of 5 minutes. */
export const POWER_PRESETS: readonly HistoryPreset[] = ['day', 'twoDays'];

// the service sums the samples of a plug into buckets of 5 minutes up to two days
const BUCKET_SECONDS = 300;

/**
 * The draw of one plug over the last 24 or 48 hours (HAS-395, `GET /aircon/power/samples`) - the average of each
 * bucket, with the line of the compressor drawn across it: above it a compressor runs. A silence of two buckets
 * is drawn through, a longer one bridged faintly (HAS-375). One call, one card: its freshness and its failure are
 * told here. Made anew for another plug; the period is the page's, shared by both charts.
 */
@Component({
  selector: 'app-aircon-power-chart',
  imports: [
    MatCardModule,
    MatIconModule,
    TranslocoDirective,
    HistoryChart,
    HistoryFrame,
    LocalNumberPipe,
  ],
  template: `
    <ng-container *transloco="let t">
      <mat-card
        appearance="outlined"
        class="chart card--domain"
        [attr.data-testid]="'power-chart-' + plug()"
      >
        <mat-card-header>
          <div mat-card-avatar class="domain-badge"><mat-icon>bolt</mat-icon></div>
          <mat-card-title>{{ t('aircon.page.chart.title') }}</mat-card-title>
          <mat-card-subtitle>{{ t(name()) }}</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <app-history-frame
            [(preset)]="period().preset"
            [presets]="presets"
            [waiting]="shown.waiting()"
            [empty]="power().length === 0"
            [error]="samples.error()"
            [describeWith]="describeError"
            [lastUpdated]="samples.lastUpdated()"
            [stale]="samples.stale()"
          >
            <ng-template>
              @let axis = shown.axis();
              @if (axis !== undefined) {
                <app-history-chart
                  [lines]="lines()"
                  [from]="axis.from"
                  [to]="axis.to"
                  unit="W"
                  [decimals]="0"
                  [bounds]="{ min: 0 }"
                  [label]="t('aircon.page.chart.label')"
                />
              }
              <ul class="facts" data-testid="chart-facts">
                @if (summary(); as drawn) {
                  <li>
                    <span class="facts__name">{{ t('aircon.page.chart.drawn') }}</span>
                    <span
                      >{{ drawn.lowest | localNumber: WATTS }} –
                      {{ drawn.highest | localNumber: WATTS }} W</span
                    >
                  </li>
                }
                <li>
                  <span class="facts__name">{{ t('aircon.page.chart.standby') }}</span>
                  <span>{{ STANDBY | localNumber: WATTS }} W</span>
                </li>
              </ul>
            </ng-template>
          </app-history-frame>
        </mat-card-content>
      </mat-card>
    </ng-container>
  `,
  styles: `
    :host {
      display: block;
    }
    .chart {
      --app-domain: var(--app-domain-aircon);

      height: 100%;
      box-sizing: border-box;
    }
    mat-card-header {
      padding: 12px 12px 0;
    }
    .facts {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface);
    }
    .facts__name {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  // a fact is a name and numbers side by side: without the white space a screen reader gets one word
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AirconPowerChart {
  /** `indoor` or `sanctum`, as `GET /aircon/power` names it. */
  readonly plug = input.required<string>();
  readonly name = input.required<MessageKey>();
  /** The period of the page, shared by both charts. */
  readonly period = input.required<HistoryPeriod>();

  protected readonly presets = POWER_PRESETS;
  protected readonly STANDBY = COMPRESSOR_STANDBY_WATTS;
  protected readonly WATTS: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };
  protected readonly describeError = describeAirconError;

  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageStore).language;

  protected readonly samples = inject(AirconApi).watchPowerSamples(
    () => this.plug(),
    () => this.period().range(),
  );
  protected readonly shown = shownHistory(this.samples, () => this.period());

  protected readonly power = computed(() =>
    toLine(this.shown.answer(), BUCKET_SECONDS, (bucket) => bucket['avg']),
  );
  protected readonly summary = computed(() => summarise(this.power()));

  protected readonly lines = computed((): ChartLine[] => {
    this.language();
    const axis = this.shown.axis();
    const standby: LinePoint[] =
      axis === undefined
        ? []
        : [
            [axis.from, COMPRESSOR_STANDBY_WATTS],
            [axis.to, COMPRESSOR_STANDBY_WATTS],
          ];
    return [
      {
        key: 'power',
        name: this.transloco.translate('aircon.page.chart.line'),
        color: 1,
        points: this.power(),
      },
      {
        key: 'standby',
        name: this.transloco.translate('aircon.page.chart.standby'),
        color: 2,
        dashed: true,
        points: standby,
      },
    ];
  });
}
