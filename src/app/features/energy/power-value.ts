import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { numberOf, powerText } from './energy-views';

/**
 * A power as the energy page writes it: "540 W", "2.74 kW" - the size only, its direction is said
 * beside it - and "not known" for a power the answer left out, never 0 W.
 */
@Component({
  selector: 'app-power-value',
  imports: [TranslocoDirective, LocalNumberPipe],
  template: `
    <ng-container *transloco="let t">
      @if (text(); as power) {
        <span class="power">{{ power.amount | localNumber: power.format }} {{ power.unit }}</span>
      } @else {
        <span class="power power--unknown">{{ t('energy.notKnown') }}</span>
      }
    </ng-container>
  `,
  styles: `
    .power {
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .power--unknown {
      color: var(--mat-sys-on-surface-variant);
      font-weight: normal;
    }
  `,
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PowerValue {
  readonly watts = input<number | undefined>();

  protected readonly text = computed(() => {
    const watts = numberOf(this.watts());
    return watts === undefined ? undefined : powerText(watts);
  });
}
