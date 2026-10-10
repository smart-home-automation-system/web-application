import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { PollingResource } from '../../core/api/polling-resource';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';

/** A domain of the house: the colour of its cards (`--app-domain-…` in `_seasons.scss`). */
export type TileDomain = 'heating' | 'water' | 'boiler' | 'household';

/**
 * One tile of the overview: a card about one call, whose title leads to the dashboard that has
 * the rest. The tile tells what every card of a polled resource tells - the bar until the first
 * answer, the freshness, the failure next to the last value - and the content says what the
 * answer holds.
 *
 * **One call, one tile**: a tile that is fed by its own resource keeps working, and keeps its
 * own failure, when the service of the tile next to it is down.
 */
@Component({
  selector: 'app-overview-tile',
  imports: [
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
  ],
  template: `
    <ng-container *transloco="let t">
      <mat-card appearance="outlined" class="tile card--domain" [attr.data-domain]="domain()">
        <mat-card-header>
          <div mat-card-avatar class="domain-badge">
            <mat-icon>{{ icon() }}</mat-icon>
          </div>
          <mat-card-title>
            <a class="tile__link" [routerLink]="link()">
              <span>{{ t(heading()) }}</span>
              <mat-icon class="tile__arrow" aria-hidden="true">chevron_right</mat-icon>
            </a>
          </mat-card-title>
          <mat-card-subtitle>
            <app-data-freshness
              [lastUpdated]="resource().lastUpdated()"
              [stale]="resource().stale()"
            />
          </mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          @if (resource().loading()) {
            <mat-progress-bar mode="indeterminate" [attr.aria-label]="t(waitingLabel())" />
          } @else {
            <ng-content />
            <app-api-error-strip [error]="resource().error()" />
          }
        </mat-card-content>
      </mat-card>
    </ng-container>
  `,
  styleUrl: './overview-tile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewTile {
  /**
   * Key of the title - the name of the dashboard the tile leads to, or of its part. Not `title`:
   * written as a plain attribute that would also be the tooltip of the element.
   */
  readonly heading = input.required<MessageKey>();
  /** Name of a Material Symbols icon. */
  readonly icon = input.required<string>();
  readonly domain = input.required<TileDomain>();
  /** The address of the dashboard. */
  readonly link = input.required<string>();
  /** The call the tile is about: its bar, its freshness and its failure. */
  readonly resource = input.required<PollingResource<unknown>>();
  /** Key of what a screen reader hears for the bar. */
  readonly waitingLabel = input.required<MessageKey>();
}
