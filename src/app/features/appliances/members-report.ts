import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoDirective } from '@jsverse/transloco';

import { APP_CONFIG } from '../../core/config/app-config';
import { sameRange } from '../../core/time/history-range';
import { Ticker } from '../../core/time/ticker';
import { ApplianceApi } from '../../data-access/appliance/appliance-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import {
  CHORES_PERIODS,
  CHORES_PERIOD_LABELS,
  ChoresPeriod,
  choresRange,
} from '../../shared/appliances/chores-period';
import {
  describeChoresError,
  sharePercent,
  toChoresTable,
} from '../../shared/appliances/chores-views';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';

/**
 * The chores per member on the appliances page (HAS-346, the report of HAS-345): the members of the
 * registry in rows, the appliances in columns, each cell "done / opportunities" with the share - the
 * opportunities being the cycles that finished while that member was at home, so the count is fair to
 * whoever was away. What was done away from home, the former members, the muted cycles and those whose
 * presence is not known are told apart. A period of whole months of the house (this one, the one before,
 * the last three); the report is a call of its own, tagged with the range it answers - until the answer to
 * the period on screen arrives, a progress bar, never last month's numbers under "this month".
 */
@Component({
  selector: 'app-members-report',
  imports: [
    NgTemplateOutlet,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    LocalNumberPipe,
  ],
  templateUrl: './members-report.html',
  styleUrl: './members-report.scss',
  // a cell is figures side by side: without the white space a screen reader reads them as one
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MembersReport {
  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly ticker = inject(Ticker);

  protected readonly periods = CHORES_PERIODS;
  protected readonly periodLabels = CHORES_PERIOD_LABELS;
  protected readonly period = signal<ChoresPeriod>('thisMonth');
  private readonly range = computed(
    () => choresRange(this.period(), this.ticker.now(), this.zone),
    {
      equal: sameRange,
    },
  );
  protected readonly report = inject(ApplianceApi).watchMembersReport(this.range);

  /** The answer to the period on screen, or `undefined` while it is on its way. */
  protected readonly table = computed(() => {
    const answered = this.report.value();
    return answered !== undefined && sameRange(answered.query, this.range())
      ? toChoresTable(answered.answer)
      : undefined;
  });
  /** The last call was for another period: its failure is not this one's. */
  protected readonly failure = computed(() => {
    const settled = this.report.settledFor();
    return settled !== undefined && sameRange(settled.query, this.range())
      ? this.report.error()
      : undefined;
  });
  protected readonly waiting = computed(
    () => this.table() === undefined && this.failure() === undefined,
  );

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /**
   * The height the card had when another period was chosen, kept until that period is answered or has
   * failed (owner, 2026-10-30): without it the card shrank to its progress bar and everything under it
   * jumped up and back. The numbers of the period before are never kept on screen for it - only its size.
   */
  protected readonly heldHeight = signal<number | undefined>(undefined);

  constructor() {
    effect(() => {
      if (!this.waiting()) {
        this.heldHeight.set(undefined);
      }
    });
  }

  protected choose(period: ChoresPeriod): void {
    if (period === this.period()) {
      return;
    }
    const card = this.host.nativeElement.querySelector<HTMLElement>('[data-testid="members-report"]');
    // the exact height, fractions included: offsetHeight rounds down and the card still moved by a pixel
    this.heldHeight.set(card?.getBoundingClientRect().height || undefined);
    this.period.set(period);
  }

  protected readonly describeError = describeChoresError;
  protected readonly percent = sharePercent;
  protected readonly ONE_DECIMAL: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };
}
