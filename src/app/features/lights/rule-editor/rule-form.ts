import { signal } from '@angular/core';
import { FormControl } from '@angular/forms';

import { MotionPeriod } from '../../../data-access/light/light-api';
import { validator } from '../../../shared/form-rules/form-rules';
import { brightnessProblem, isRgb, timeProblem, whiteProblem, wholeOf } from './room-rule-rules';

let rows = 0;

/** The colour a new period starts with when a colour is switched on: a warm white. */
export const DEFAULT_COLOR = '#ffb46e';

/**
 * A row of the motion scheme: from when to when a motion lights the room, and with what - a
 * brightness, and for the rgbw lights a colour and a white. A text field is a form control with the
 * rule of the service as its validator; whether a colour is set is a signal.
 *
 * What the row was filled with and this version cannot show - an `rgb` that is not three values
 * 0 ... 255 - is kept as `unreadable`: it stops the save, so that it is never sent back unseen.
 */
export class PeriodForm {
  /** What the row is tracked by: two rows may say the same. */
  readonly key = rows++;

  readonly from = new FormControl('', { nonNullable: true, validators: validator(timeProblem) });
  readonly to = new FormControl('', { nonNullable: true, validators: validator(timeProblem) });
  readonly brightness = new FormControl('', {
    nonNullable: true,
    validators: validator(brightnessProblem),
  });
  readonly white = new FormControl('', { nonNullable: true, validators: validator(whiteProblem) });
  /** Whether the period sets a colour (`rgb`). */
  readonly colorOn = signal(false);
  /** The colour as `#rrggbb` - what the colour field of the browser gives. */
  readonly color = signal(DEFAULT_COLOR);
  /** The stored `rgb` could not be read: shown as it came, and the save waits for a choice. */
  readonly unreadable = signal<string | undefined>(undefined);

  constructor(period?: MotionPeriod) {
    if (period === undefined) {
      return;
    }
    this.from.setValue(period.from ?? '');
    this.to.setValue(period.to ?? '');
    this.brightness.setValue(
      typeof period.brightness === 'number' ? String(period.brightness) : '',
    );
    this.white.setValue(typeof period.white === 'number' ? String(period.white) : '');
    if (period.rgb !== undefined) {
      if (isRgb(period.rgb)) {
        this.colorOn.set(true);
        this.color.set(hexOf(period.rgb));
      } else {
        this.unreadable.set(JSON.stringify(period.rgb));
      }
    }
  }

  setColorOn(on: boolean): void {
    this.colorOn.set(on);
    // a choice made: what could not be read is replaced by it
    this.unreadable.set(undefined);
  }

  setColor(hex: string): void {
    if (/^#[0-9a-f]{6}$/i.test(hex)) {
      this.color.set(hex.toLowerCase());
    }
  }

  /** Whether the row sets a colour or a white - it needs an rgbw light in the room. */
  colored(): boolean {
    return this.colorOn() || this.white.value.trim() !== '' || this.unreadable() !== undefined;
  }

  controls(): readonly FormControl<string>[] {
    return [this.from, this.to, this.brightness, this.white];
  }

  /** The period as it is sent: a part left empty is left out - the lights keep their own. */
  value(): MotionPeriod {
    const brightness = wholeOf(this.brightness.value);
    const white = wholeOf(this.white.value);
    return {
      from: this.from.value.trim(),
      to: this.to.value.trim(),
      ...(brightness === undefined ? {} : { brightness }),
      ...(this.colorOn() ? { rgb: rgbOf(this.color()) } : {}),
      ...(white === undefined ? {} : { white }),
    };
  }
}

/** `[255, 180, 110]` as `#ffb46e`. */
export function hexOf(rgb: readonly [number, number, number]): string {
  return `#${rgb.map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

/** `#ffb46e` as `[255, 180, 110]`. */
export function rgbOf(hex: string): readonly [number, number, number] {
  return [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) as unknown as readonly [
    number,
    number,
    number,
  ];
}
