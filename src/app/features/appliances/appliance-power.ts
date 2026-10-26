import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';

import { LanguageStore } from '../../core/i18n/language-store';
import { ApplianceApi } from '../../data-access/appliance/appliance-api';
import { ApplianceSettings } from '../../data-access/devices/device-registry-api';
import { ChartLine, LinePoint, summarise, toLine } from '../../shared/history-chart/chart-data';
import { HistoryChart } from '../../shared/history-chart/history-chart';
import { HistoryFrame } from '../../shared/history-chart/history-frame';
import { HistoryPeriod, shownHistory } from '../../shared/history-chart/history-period';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { POWER_PRESETS } from './appliance-history';

// a plug is read every 30 s: three missed reads are a gap in the line, never a slope across it
const GAP_SECONDS = 90;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * The draw of the plug of one appliance over the last 24 or 48 hours (HAS-283), with the two thresholds
 * of its settings drawn across it - the cycle runs above the upper one and ends below the lower one - so
 * the administrator sees where a pause or the turns of a dryer fall before changing them on the devices
 * page. One call, one card: its freshness and its failure are told here. Made anew for another appliance.
 */
@Component({
  selector: 'app-appliance-power',
  imports: [MatCardModule, MatIconModule, TranslocoDirective, HistoryChart, HistoryFrame, LocalNumberPipe],
  template: `
    <ng-container *transloco="let t">
      <mat-card appearance="outlined" class="power card--domain" [attr.data-testid]="'power-' + id()">
        <mat-card-header>
          <div mat-card-avatar class="domain-badge"><mat-icon>bolt</mat-icon></div>
          <mat-card-title>{{ t('appliances.page.power.title') }}</mat-card-title>
          <!-- the name of the registry, printed as it is -->
          <mat-card-subtitle>{{ name() }}</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <app-history-frame
            [(preset)]="period().preset"
            [presets]="presets"
            [waiting]="shown.waiting()"
            [empty]="power().length === 0"
            [error]="samples.error()"
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
                  [label]="t('appliances.page.power.label')"
                />
              }
              <ul class="power__facts" data-testid="power-facts">
                @if (summary(); as drawn) {
                  <li>
                    <span class="power__name">{{ t('appliances.page.power.drawn') }}</span>
                    <span>{{ drawn.lowest | localNumber: WATTS }} – {{ drawn.highest | localNumber: WATTS }} W</span>
                  </li>
                }
                @if (settings()?.runningAboveWatts; as above) {
                  <li>
                    <span class="power__name">{{ t('appliances.page.power.runningAbove') }}</span>
                    <span>{{ above | localNumber: WATTS }} W</span>
                  </li>
                }
                @if (settings()?.idleBelowWatts; as below) {
                  <li>
                    <span class="power__name">{{ t('appliances.page.power.idleBelow') }}</span>
                    <span>{{ below | localNumber: WATTS }} W</span>
                  </li>
                }
              </ul>
            </ng-template>
          </app-history-frame>
        </mat-card-content>
      </mat-card>
    </ng-container>
  `,
  styleUrl: './appliance-power.scss',
  // a fact is a name and numbers side by side: without the white space a screen reader gets one word
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppliancePower {
  readonly id = input.required<number>();
  readonly name = input.required<string>();
  readonly settings = input<ApplianceSettings | undefined>();
  /** The period of the page, shared by every chart of it. */
  readonly period = input.required<HistoryPeriod>();

  protected readonly presets = POWER_PRESETS;
  protected readonly WATTS: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };

  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageStore).language;

  protected readonly samples = inject(ApplianceApi).watchSampleHistory(
    () => this.id(),
    () => this.period().range(),
  );
  protected readonly shown = shownHistory(this.samples, () => this.period());

  protected readonly power = computed(() =>
    toLine(this.shown.answer(), GAP_SECONDS, (sample) => sample['watts']),
  );
  protected readonly summary = computed(() => summarise(this.power()));

  protected readonly lines = computed((): ChartLine[] => {
    this.language();
    const axis = this.shown.axis();
    const settings = this.settings();
    const line = (value: number): LinePoint[] =>
      axis === undefined ? [] : [[axis.from, value], [axis.to, value]];
    const thresholds: ChartLine[] = [];
    if (finite(settings?.runningAboveWatts)) {
      thresholds.push({
        key: 'running-above',
        name: this.transloco.translate('appliances.page.power.runningAbove'),
        color: 2,
        dashed: true,
        points: line(settings.runningAboveWatts),
      });
    }
    if (finite(settings?.idleBelowWatts)) {
      thresholds.push({
        key: 'idle-below',
        name: this.transloco.translate('appliances.page.power.idleBelow'),
        color: 3,
        dashed: true,
        points: line(settings.idleBelowWatts),
      });
    }
    return [
      { key: 'power', name: this.transloco.translate('appliances.page.power.line'), color: 1, points: this.power() },
      ...thresholds,
    ];
  });
}
