import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';

/**
 * A temperature on a scale, against the band it is kept in: a track from `min` to `max`, the
 * band between `low` and `high` in the colour of the domain, and a marker at the value. A value
 * off the scale stops at its end - the number next to the gauge says how far off it is.
 *
 * To a screen reader it is a meter; `label` and `valueText` are its name and its reading, both
 * already in the language of the interface.
 */
@Component({
  selector: 'app-temperature-gauge',
  imports: [LocalNumberPipe],
  template: `
    <div
      class="gauge"
      role="meter"
      [attr.aria-label]="label()"
      [attr.aria-valuemin]="min()"
      [attr.aria-valuemax]="max()"
      [attr.aria-valuenow]="value()"
      [attr.aria-valuetext]="valueText()"
    >
      <div class="gauge__track">
        <div
          class="gauge__band"
          [style.left.%]="at(low())"
          [style.width.%]="at(high()) - at(low())"
        ></div>
        <div class="gauge__marker" [style.left.%]="marker()"></div>
      </div>
      <!-- the same numbers are in the reading of the meter -->
      <div class="gauge__scale" aria-hidden="true">
        <span [style.left.%]="at(low())">{{ low() | localNumber }} °C</span>
        <span [style.left.%]="at(high())">{{ high() | localNumber }} °C</span>
      </div>
    </div>
  `,
  styles: `
    .gauge {
      // room for the marker, which stands taller than the track
      padding-top: 6px;
    }

    .gauge__track {
      position: relative;
      height: 10px;
      border-radius: var(--mat-sys-corner-full);
      background: color-mix(in srgb, var(--mat-sys-outline) 35%, transparent);
    }

    .gauge__band {
      position: absolute;
      inset-block: 0;
      border-radius: var(--mat-sys-corner-full);
      background: var(--app-domain);
    }

    .gauge__marker {
      position: absolute;
      top: -6px;
      width: 4px;
      height: 22px;
      margin-left: -2px;
      border-radius: var(--mat-sys-corner-full);
      background: var(--mat-sys-on-surface);
      // a rim of the card behind it, so the marker stays apart from the band it crosses
      box-shadow: 0 0 0 2px var(--mat-sys-surface);
      transition: left 400ms cubic-bezier(0.4, 0, 0.2, 1);

      @media (prefers-reduced-motion: reduce) {
        transition: none;
      }
    }

    .gauge__scale {
      position: relative;
      height: 1.5rem;
      margin-top: 8px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);

      span {
        position: absolute;
        transform: translateX(-50%);
        white-space: nowrap;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemperatureGauge {
  readonly value = input.required<number>();
  /** The band the temperature is kept in. */
  readonly low = input.required<number>();
  readonly high = input.required<number>();
  /**
   * The ends of the scale: wide enough for water that cooled down over a weekend away or was
   * heated past its band, narrow enough for the band to be a stretch and not a tick.
   */
  readonly min = input(30);
  readonly max = input(50);
  /** The name of the meter and its reading, for a screen reader. */
  readonly label = input.required<string>();
  readonly valueText = input.required<string>();

  protected readonly marker = computed(() => this.at(this.value()));

  /** Where a temperature lies on the scale, in per cent of its length. */
  protected at(temperature: number): number {
    const share = (temperature - this.min()) / (this.max() - this.min());
    // to a hundredth of a per cent: finer than a pixel, and free of the tail binary fractions leave
    return Math.round(Math.min(100, Math.max(0, share * 100)) * 100) / 100;
  }
}
