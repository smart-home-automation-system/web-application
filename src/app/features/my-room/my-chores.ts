import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { APP_CONFIG } from '../../core/config/app-config';
import { ProfileStore } from '../../core/profile/profile-store';
import { sameRange } from '../../core/time/history-range';
import { Ticker } from '../../core/time/ticker';
import { ApplianceApi } from '../../data-access/appliance/appliance-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { choresRange } from '../../shared/appliances/chores-period';
import {
  choresOf,
  describeChoresError,
  sharePercent,
  toChoresTable,
} from '../../shared/appliances/chores-views';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';

/**
 * "Mine this month" on My room (HAS-346): the chores of the member of the profile in this calendar month of
 * the house - per appliance what they emptied out of the cycles that finished while they were at home - from
 * the report of HAS-345. For every member, in the row of the household. Nothing is drawn while the household
 * has no appliance in the report; a failure before any answer is told.
 */
@Component({
  selector: 'app-my-chores',
  imports: [
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    LocalNumberPipe,
  ],
  template: `
    <ng-container *transloco="let t">
      @if (shown()) {
        <mat-card appearance="outlined" class="chores card--domain" data-testid="my-chores">
          <mat-card-header>
            <div mat-card-avatar class="domain-badge"><mat-icon>task_alt</mat-icon></div>
            <mat-card-title>{{ t('chores.mine.title') }}</mat-card-title>
            <mat-card-subtitle>
              <app-data-freshness [lastUpdated]="report.lastUpdated()" [stale]="report.stale()" />
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content class="chores__content">
            <app-api-error-strip [error]="report.error()" [describeWith]="describeError" />
            @if (table(); as shown) {
              @if (mine(); as row) {
                <ul class="chores__list">
                  @for (column of shown.columns; track column.id; let i = $index) {
                    <li class="chores__line" [attr.data-appliance]="column.id">
                      <!-- the name of the registry, printed as it is -->
                      <span class="chores__name">{{
                        column.name ?? t('chores.report.applianceGone')
                      }}</span>
                      <span class="chores__figures">
                        {{ row.cells[i]?.done | localNumber: ONE_DECIMAL }} /
                        {{ row.cells[i]?.opportunities | localNumber }}
                        @if (percent(row.cells[i]) !== undefined) {
                          <span class="chores__share">{{ percent(row.cells[i]) }}%</span>
                        }
                      </span>
                    </li>
                  }
                </ul>
                <p class="chores__note">{{ t('chores.report.legend') }}</p>
              } @else {
                <p class="chores__note">{{ t('chores.mine.notInReport') }}</p>
              }
            } @else if (report.loading()) {
              <mat-progress-bar
                mode="indeterminate"
                [attr.aria-label]="t('chores.report.loading')"
              />
            }
          </mat-card-content>
        </mat-card>
      }
    </ng-container>
  `,
  styles: `
    /* laid out by the row of the household on My room, as the appliances card */
    :host {
      display: contents;
    }

    .chores {
      --app-domain: var(--app-domain-appliance);
    }

    mat-card-header {
      padding: 12px 12px 0;
    }

    .chores__content {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 8px 12px 12px;
    }

    .chores__list {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .chores__line {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 6px 0;
      border-bottom: 1px solid var(--app-glass-edge);
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface);
    }

    .chores__share {
      margin-left: 6px;
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-primary-container);
    }

    .chores__note {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  // the figures of a line side by side: without the white space a screen reader reads them as one
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyChores {
  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly ticker = inject(Ticker);
  private readonly profiles = inject(ProfileStore);

  private readonly range = computed(() => choresRange('thisMonth', this.ticker.now(), this.zone), {
    equal: sameRange,
  });
  protected readonly report = inject(ApplianceApi).watchMembersReport(this.range);

  protected readonly table = computed(() => {
    const answered = this.report.value();
    return answered !== undefined && sameRange(answered.query, this.range())
      ? toChoresTable(answered.answer)
      : undefined;
  });
  protected readonly mine = computed(() => choresOf(this.table(), this.profiles.profile()?.name));

  /** Drawn once the report names an appliance, or a failure before any answer. */
  protected readonly shown = computed(
    () =>
      (this.table()?.columns.length ?? 0) > 0 ||
      (this.report.value() === undefined && this.report.error() !== undefined),
  );

  protected readonly describeError = describeChoresError;
  protected readonly percent = sharePercent;
  protected readonly ONE_DECIMAL: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };
}
