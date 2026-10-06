import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { LanguageStore } from '../../core/i18n/language-store';
import { Ticker } from '../../core/time/ticker';
import { MessageKey } from '../../i18n/messages';
import { JUST_NOW_MS, formatAge } from '../age/format-age';

interface FreshnessView {
  readonly key: MessageKey;
  /** The age in words, or undefined when it is too small to count ("just now"). */
  readonly age?: string;
}

/**
 * How fresh the data of a polled resource is: "Updated 20 sec ago", or a warning once it can no
 * longer be trusted. Every view fed by polling shows one - a number without its age reads as
 * current even when the backend stopped answering an hour ago.
 */
@Component({
  selector: 'app-data-freshness',
  imports: [MatIconModule, TranslocoDirective],
  template: `
    <ng-container *transloco="let t">
      @if (stale()) {
        <mat-icon class="freshness__icon">warning</mat-icon>
      }
      <span>{{ t(view().key, { age: view().age ?? t('freshness.justNow') }) }}</span>
    </ng-container>
  `,
  styleUrl: './data-freshness.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.freshness--stale]': 'stale()' },
})
export class DataFreshness {
  /** Epoch milliseconds of the last successful update. */
  readonly lastUpdated = input.required<number | undefined>();
  readonly stale = input.required<boolean>();

  private readonly ticker = inject(Ticker);
  private readonly locale = inject(LanguageStore).locale;

  protected readonly view = computed((): FreshnessView => {
    const updated = this.lastUpdated();
    if (updated === undefined) {
      return { key: this.stale() ? 'freshness.noData' : 'freshness.waiting' };
    }
    const ageMs = Math.max(0, this.ticker.now() - updated);
    return {
      key: this.stale() ? 'freshness.outOfDate' : 'freshness.updated',
      age: ageMs < JUST_NOW_MS ? undefined : formatAge(ageMs, this.locale()),
    };
  });
}
