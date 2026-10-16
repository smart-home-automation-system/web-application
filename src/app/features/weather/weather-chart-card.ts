import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { HistoryPreset } from '../../core/time/history-range';
import { HistoryChart } from '../../shared/history-chart/history-chart';
import { HistoryFrame } from '../../shared/history-chart/history-frame';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { WeatherChartView } from './weather-charts';

/**
 * One chart of the weather page in its card: the period, the bar while its answers are awaited,
 * the failure and the freshness of its calls (`HistoryFrame`), the picture, and under it what
 * the picture shows in numbers - the lowest and the highest bucket of a line, the sum of the
 * bars. The period is the page's: choosing it here chooses it for every chart.
 */
@Component({
  selector: 'app-weather-chart-card',
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
      @let spec = chart().spec;
      <mat-card
        appearance="outlined"
        class="chart card--domain"
        [attr.data-testid]="'chart-' + spec.key"
      >
        <mat-card-header>
          <div mat-card-avatar class="domain-badge">
            <mat-icon>{{ spec.icon }}</mat-icon>
          </div>
          <mat-card-title>{{ t(spec.title) }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <app-history-frame
            [(preset)]="preset"
            [waiting]="chart().waiting()"
            [empty]="chart().lines().length === 0"
            [error]="chart().error()"
            [lastUpdated]="chart().lastUpdated()"
            [stale]="chart().stale()"
          >
            <ng-template>
              @let axis = chart().axis();
              @if (axis !== undefined) {
                <app-history-chart
                  [lines]="chart().lines()"
                  [from]="axis.from"
                  [to]="axis.to"
                  [unit]="spec.unit"
                  [decimals]="spec.decimals"
                  [bounds]="spec.bounds"
                  [logarithmic]="spec.logarithmic ?? false"
                  [label]="t(spec.label)"
                />
              }
              <ul class="chart__facts" data-testid="history-facts">
                @for (fact of chart().facts(); track fact.key) {
                  <li>
                    <span class="chart__name">{{ fact.name }}</span>
                    @if (fact.kind === 'range') {
                      <span
                        >{{ fact.lowest | localNumber: format() }} –
                        {{ fact.highest | localNumber: format() }}{{ unitText() }}</span
                      >
                    } @else {
                      <span
                        >{{ t('weather.charts.total') }} {{ fact.total | localNumber: format()
                        }}{{ unitText() }}</span
                      >
                    }
                  </li>
                }
              </ul>
              @if (spec.note; as note) {
                <p class="chart__note">{{ t(note) }}</p>
              }
            </ng-template>
          </app-history-frame>
        </mat-card-content>
      </mat-card>
    </ng-container>
  `,
  styleUrl: './weather-chart-card.scss',
  // a fact is a name and two numbers side by side: without the white space between them a
  // screen reader gets one word
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeatherChartCard {
  readonly chart = input.required<WeatherChartView>();
  /** The period of the page. */
  readonly preset = model.required<HistoryPreset>();

  protected readonly format = computed((): Intl.NumberFormatOptions => ({
    minimumFractionDigits: this.chart().spec.decimals,
    maximumFractionDigits: this.chart().spec.decimals,
  }));
  /** The unit after a number, with its space; nothing where it is not known. */
  protected readonly unitText = computed(() => {
    const unit = this.chart().spec.unit;
    return unit ? ` ${unit}` : '';
  });
}
