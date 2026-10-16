import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';

/**
 * How old the readings of a card are: "Measured 2 min ago" - the newest of them, so the last the
 * station was heard of what the card shows. When every one of them is stale the line says that
 * the station has not been heard since, on the strip of an error. Nothing for readings without
 * a time: an age is never made up.
 */
@Component({
  selector: 'app-reading-age',
  imports: [TranslocoDirective, HouseAgePipe],
  template: `
    <ng-container *transloco="let t">
      @if (newest(); as last) {
        @if (last.measuredAt | houseAge; as age) {
          <p class="age" [class.age--alert]="last.allStale" data-testid="measured">
            {{ t(last.allStale ? 'weather.measuredOutOfDate' : 'weather.measured', { age }) }}
          </p>
        }
      }
    </ng-container>
  `,
  styles: `
    .age {
      margin: 4px 0 0;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    // what somebody should look at: a sentence on the tinted strip of an error
    .age--alert {
      padding: 8px 12px;
      border-radius: var(--mat-sys-corner-small);
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReadingAge {
  /** `newestOf` the metrics of the card; `undefined` when none of them says when it was measured. */
  readonly newest = input.required<
    { readonly measuredAt: string; readonly allStale: boolean } | undefined
  >();
}
