import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { PollingResource } from '../../core/api/polling-resource';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../api-error/api-error-strip';
import { DataFreshness } from '../data-freshness/data-freshness';

/** One call a page is made of. */
export interface Source {
  readonly id: string;
  readonly label: MessageKey;
  readonly resource: PollingResource<unknown>;
}

/**
 * The calls a page is put together from, each with its freshness and its failure, **told once**
 * at the top of the page and never on the cards that show their data (HAS-232, the rooms; HAS-252,
 * the blinds). A progress bar while the first of them has not answered.
 */
@Component({
  selector: 'app-sources-strip',
  imports: [MatCardModule, MatProgressBarModule, TranslocoDirective, ApiErrorStrip, DataFreshness],
  template: `
    <ng-container *transloco="let t">
      <mat-card
        appearance="outlined"
        class="sources card--domain"
        data-testid="sources"
        [style.--app-domain]="'var(--app-domain-' + domain() + ')'"
      >
        <mat-card-content class="sources__content">
          @for (source of sources(); track source.id) {
            <div class="source" [attr.data-source]="source.id">
              <span class="source__name">{{ t(source.label) }}</span>
              <app-data-freshness
                [lastUpdated]="source.resource.lastUpdated()"
                [stale]="source.resource.stale()"
              />
              <app-api-error-strip [error]="source.resource.error()" />
            </div>
          }
        </mat-card-content>
        @if (sources()[0]?.resource?.loading()) {
          <mat-progress-bar mode="indeterminate" [attr.aria-label]="t(loadingLabel())" />
        }
      </mat-card>
    </ng-container>
  `,
  styles: `
    :host {
      display: block;
      align-self: center;
      width: min(100%, 960px);
    }

    .sources__content {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
      gap: 6px 16px;
      padding: 12px 16px;
    }

    .source {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    .source__name {
      font: var(--mat-sys-label-large);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourcesStrip {
  readonly sources = input.required<readonly Source[]>();
  /** The domain whose colour runs along the top edge: `devices`, `blinds` ... */
  readonly domain = input.required<string>();
  /** The words of the progress bar of the first call. */
  readonly loadingLabel = input.required<MessageKey>();
}
