import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * The direction of the wind as an arrow on a dial: the arrow points where the wind blows, from
 * the direction the station reports (where it comes from - the way of a weather map). North is
 * up. A picture only: the direction in words stands next to it, so the dial is hidden from a
 * screen reader.
 */
@Component({
  selector: 'app-wind-compass',
  template: `
    <svg viewBox="-24 -24 48 48" aria-hidden="true" focusable="false">
      <circle class="compass__dial" r="21" />
      <text class="compass__north" y="-13">N</text>
      <g [attr.transform]="'rotate(' + blowsTo() + ')'">
        <path class="compass__arrow" d="M0 -16 L5 4 L0 0 L-5 4 Z" />
        <line class="compass__tail" x1="0" y1="0" x2="0" y2="14" />
      </g>
    </svg>
  `,
  styles: `
    :host {
      display: inline-block;
      width: 44px;
      height: 44px;
      flex: none;
    }

    svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    .compass__dial {
      fill: none;
      stroke: var(--mat-sys-outline);
      stroke-width: 1.5;
    }

    .compass__north {
      fill: var(--mat-sys-on-surface-variant);
      font: 600 8px var(--mat-sys-body-small-font, sans-serif);
      text-anchor: middle;
      dominant-baseline: middle;
    }

    .compass__arrow {
      fill: var(--mat-sys-on-surface);
    }

    .compass__tail {
      stroke: var(--mat-sys-on-surface);
      stroke-width: 2;
      stroke-linecap: round;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WindCompass {
  /** Where the wind comes from, in degrees clockwise from north. */
  readonly from = input.required<number>();

  /** The arrow points the other way: where the wind goes. */
  protected readonly blowsTo = computed(() => (((this.from() + 180) % 360) + 360) % 360);
}
