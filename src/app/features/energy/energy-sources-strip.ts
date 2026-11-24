import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { ApiError } from '../../core/api/api-error';
import { PollingResource } from '../../core/api/polling-resource';
import { EnergyStatus } from '../../data-access/energy/energy-api';
import { DisplayText } from '../../i18n/messages';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { gridStateOf, sourcesOf } from './energy-views';

/**
 * The grid as the SOLAX sees it and whether each source of energy answers - one call, `GET /energy/status` - as a
 * strip at the top of the page (owner, 2026-11-24, HAS-504: the look of the strip of the air conditioning page; it was
 * a card beside the flow). The freshness and the failure of the call are told once, under the cells. What the answer
 * does not say is "not known": a grid not known is never lost, a source without `reachable` never silent.
 */
@Component({
  selector: 'app-energy-sources-strip',
  imports: [
    MatCardModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    HouseAgePipe,
    HouseDateTimePipe,
  ],
  template: `
    <ng-container *transloco="let t">
      <mat-card
        appearance="outlined"
        class="sources card--domain"
        data-testid="card-sources"
        [style.--app-domain]="'var(--app-domain-energy)'"
      >
        <mat-card-content class="sources__content">
          @if (status().value()) {
            <div class="source" data-source="grid">
              <span class="source__name">{{ t('energy.gridState.label') }}</span>
              <!-- the state and since when, one under another (owner, 2026-11-24: no icon)-->
              <span class="source__line">
                @switch (gridState()) {
                  @case ('lost') {
                    <span class="source__value source__value--alert" data-testid="grid-state" data-state="lost">{{
                      t('energy.gridState.lost')
                    }}</span>
                  }
                  @case ('present') {
                    <span class="source__value" data-testid="grid-state" data-state="present">{{
                      t('energy.gridState.present')
                    }}</span>
                  }
                  @default {
                    <span class="source__value" data-testid="grid-state" data-state="unknown">{{
                      t('energy.gridState.unknown')
                    }}</span>
                  }
                }
                @if (gridState() !== undefined && gridSince(); as since) {
                  <span class="source__when">{{ t('energy.gridState.since') }} {{ since | houseDateTime }}</span>
                }
              </span>
            </div>
            @for (source of sources(); track source.id) {
              <div class="source" [attr.data-source]="source.id">
                <span class="source__name">{{ source.label ? t(source.label) : source.id }}</span>
                @if (source.reachable === false) {
                  <span class="source__value source__value--alert">{{ t('energy.reachable.no') }}</span>
                } @else {
                  <span class="source__value">{{
                    source.reachable === undefined ? t('energy.reachable.unknown') : t('energy.reachable.yes')
                  }}</span>
                }
                @if (source.lastReadingAt; as at) {
                  <span class="source__when">{{ at | houseAge }}</span>
                }
              </div>
            }
          } @else if (!status().error() && !status().loading()) {
            <p class="source__when">{{ t('energy.cards.none') }}</p>
          }
          <!-- how fresh the one call of the whole strip is: the last cell of the row, at its right (owner, 2026-11-24) -->
          <div class="source source--call">
            <app-data-freshness [lastUpdated]="status().lastUpdated()" [stale]="status().stale()" />
          </div>
        </mat-card-content>
        @if (status().error()) {
          <div class="sources__call">
            <app-api-error-strip [error]="status().error()" [describeWith]="describeWith()" />
          </div>
        }
        @if (status().loading() && !status().value()) {
          <mat-progress-bar mode="indeterminate" [attr.aria-label]="t('energy.page.loading')" />
        }
      </mat-card>
    </ng-container>
  `,
  styles: `
    :host {
      display: block;
    }

    .sources__content {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr));
      gap: 8px 16px;
      padding: 12px 16px;
    }

    .source {
      display: grid;
      gap: 2px;
      min-width: 0;
      align-content: start;
    }

    .source__name {
      font: var(--mat-sys-label-large);
    }

    // the state of the grid and since when one under another, as the word and the age of a source (owner, 2026-11-24)
    .source__line {
      display: grid;
      gap: 2px;
    }

    .source__value {
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface);
    }

    // a lost grid and a silent source are the two things of the strip in red, always with their words
    .source__value--alert {
      color: var(--mat-sys-error);
    }

    .source__when {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }

    .source--call {
      align-content: center;
      justify-items: end;
    }

    .sources__call {
      display: grid;
      gap: 4px;
      padding: 0 16px 10px;
    }
  `,
  // the name, the word and the age of a cell are pieces of text one under another: kept apart for a screen reader too
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnergySourcesStrip {
  readonly status = input.required<PollingResource<EnergyStatus | null>>();
  readonly describeWith = input.required<(error: ApiError) => DisplayText>();

  protected readonly sources = computed(() => sourcesOf(this.status().value()));
  protected readonly gridState = computed(() => gridStateOf(this.status().value()));
  protected readonly gridSince = computed(() => this.status().value()?.grid?.since);
}
