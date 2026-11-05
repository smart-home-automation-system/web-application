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
      [attr.aria-valuenow]="onScale()"
      [attr.aria-valuetext]="valueText()"
    >
      <div class="gauge__track">
        <div
          class="gauge__band"
          [style.left.%]="at(low())"
          [style.width.%]="between(low(), high())"
        ></div>
        <div class="gauge__marker" [style.left.%]="marker()"></div>
      </div>
      <!-- the same numbers are in the reading of the meter -->
      <!-- the ends of the scale at its ends, the band under its middle: on a scale of 60 degrees the two
           ends of a band of 4 would stand on each other -->
      <div class="gauge__scale" aria-hidden="true">
        <span class="gauge__end">{{ min() | localNumber }} °C</span>
        <span class="gauge__band-label" [style.left.%]="(at(low()) + at(high())) / 2"
          >{{ low() | localNumber }}–{{ high() | localNumber }} °C</span
        >
        <span class="gauge__end gauge__end--max">{{ max() | localNumber }} °C</span>
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
        white-space: nowrap;
      }
    }

    .gauge__band-label {
      transform: translateX(-50%);
      color: var(--mat-sys-on-surface);
    }

    .gauge__end {
      left: 0;
    }

    .gauge__end--max {
      left: auto;
      right: 0;
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
   * The ends of the scale: the water of the tank as it is over a year (owner, 2026-11-05, HAS-322) - down to some
   * 20 °C after a weekend away, up to 80 °C on a hot summer day when the panels heat it.
   */
  readonly min = input(20);
  readonly max = input(80);
  /** The name of the meter and its reading, for a screen reader. */
  readonly label = input.required<string>();
  readonly valueText = input.required<string>();

  protected readonly marker = computed(() => this.at(this.value()));
  /**
   * The value as a meter may report it: within its scale. The true number, when the water is
   * off the scale, is in `valueText` - which is what a screen reader reads out.
   */
  protected readonly onScale = computed(() =>
    Math.min(this.max(), Math.max(this.min(), this.value())),
  );

  /** How much of the scale lies between two temperatures, in per cent of its length - rounded as `at` is. */
  protected between(from: number, to: number): number {
    return Math.round((this.at(to) - this.at(from)) * 100) / 100;
  }

  /** Where a temperature lies on the scale, in per cent of its length. */
  protected at(temperature: number): number {
    const length = this.max() - this.min();
    if (!(length > 0)) {
      // a scale without a length has no places: everything sits at its start
      return 0;
    }
    const share = (temperature - this.min()) / length;
    // to a hundredth of a per cent: finer than a pixel, and free of the tail binary fractions leave
    return Math.round(Math.min(100, Math.max(0, share * 100)) * 100) / 100;
  }
}
