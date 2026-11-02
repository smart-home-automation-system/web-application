import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { HistoryPreset } from '../../core/time/history-range';
import { HistoryChart } from '../../shared/history-chart/history-chart';
import { HistoryFrame } from '../../shared/history-chart/history-frame';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { describeEnergyError } from './energy-errors';
import { EnergyChartView } from './energy-charts';

/**
 * One chart of the energy page in its card - the card of a weather chart: the period, the bar, the
 * failure and the freshness of its calls, the picture, and under it the lowest and the highest
 * bucket of each line. The period is the page's.
 */
@Component({
  selector: 'app-energy-chart-card',
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
            [describeWith]="describe"
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
                  [label]="t(spec.label)"
                />
              }
              <ul class="chart__facts" data-testid="history-facts">
                @for (fact of chart().facts(); track fact.key) {
                  <li>
                    <span class="chart__name">{{ fact.name }}</span>
                    <span
                      >{{ fact.lowest | localNumber: format() }} –
                      {{ fact.highest | localNumber: format() }} {{ spec.unit }}</span
                    >
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
  styleUrl: './energy-chart-card.scss',
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergyChartCard {
  protected readonly describe = describeEnergyError;
  readonly chart = input.required<EnergyChartView>();
  /** The period of the page. */
  readonly preset = model.required<HistoryPreset>();

  protected readonly format = computed((): Intl.NumberFormatOptions => ({
    minimumFractionDigits: this.chart().spec.decimals,
    maximumFractionDigits: this.chart().spec.decimals,
  }));
}
