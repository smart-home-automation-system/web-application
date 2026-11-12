import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { AirLevel, airLevelColour } from '../../data-access/weather/air-quality';

/**
 * The colour of a level of the air quality as a dot (HAS-431) - on the weather page, in the strip of the panel and
 * on the overview. Drawing only: hidden from a screen reader, and never alone - whoever places it writes the word of
 * the level beside it (or into its tooltip and a hidden text, in the strip).
 */
@Component({
  selector: 'app-air-level-dot',
  template: '',
  host: {
    'aria-hidden': 'true',
    '[style.--air-level]': 'colour()',
    '[attr.data-level]': 'level()',
  },
  styles: `
    :host {
      display: inline-block;
      flex: none;
      width: 0.75em;
      height: 0.75em;
      border-radius: var(--mat-sys-corner-full);
      background: var(--air-level);
      // an edge of the text colour, faint, so a pale yellow keeps its shape on a pale page
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--mat-sys-on-surface) 25%, transparent);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AirLevelDot {
  readonly level = input.required<AirLevel>();
  protected readonly colour = computed(() => airLevelColour(this.level()));
}
