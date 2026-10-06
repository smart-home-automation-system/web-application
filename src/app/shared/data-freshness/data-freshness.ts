import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { Ticker } from '../../core/time/ticker';
import { formatAge } from '../age/format-age';

/**
 * How fresh the data of a polled resource is: "Updated 20 sec. ago", or a warning once it can no
 * longer be trusted. Every view fed by polling shows one - a number without its age reads as
 * current even when the backend stopped answering an hour ago.
 */
@Component({
  selector: 'app-data-freshness',
  imports: [MatIconModule],
  template: `
    @if (stale()) {
      <mat-icon class="freshness__icon">warning</mat-icon>
    }
    <span>{{ label() }}</span>
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
  private readonly locale = inject(LOCALE_ID);

  protected readonly label = computed(() => {
    const updated = this.lastUpdated();
    if (updated === undefined) {
      return this.stale() ? 'No data received' : 'Waiting for data';
    }
    const age = formatAge(Math.max(0, this.ticker.now() - updated), this.locale);
    return this.stale() ? `Out of date - last update ${age}` : `Updated ${age}`;
  });
}
