import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoDirective } from '@jsverse/transloco';

import { DeviceCommands } from '../../core/api/device-commands';
import { Light, LightApi } from '../../data-access/light/light-api';
import { MessageKey } from '../../i18n/messages';
import { DisplayTextPipe } from '../display-text/display-text.pipe';
import { HouseAgePipe } from '../house-age/house-age.pipe';
import { HouseDateTimePipe } from '../house-date-time/house-date-time.pipe';
import { lightFailureOf } from './light-errors';
import { LIGHT_STATE_LABELS, cssColorOf, dims, lightSourceText, stateOf } from './light-labels';

/** A light a control can address: one with an id. */
export type ControlledLight = Light & { readonly id: number };

/** The parts of a colour being chosen: red, green, blue, and white where the light has it. */
type Chosen = readonly [number, number, number, number];
const WHITE: readonly [number, number, number] = [255, 255, 255];

interface ColorPart {
  readonly index: 0 | 1 | 2 | 3;
  readonly label: MessageKey;
}

const COLOR_PARTS: readonly ColorPart[] = [
  { index: 0, label: 'lights.window.red' },
  { index: 1, label: 'lights.window.green' },
  { index: 2, label: 'lights.window.blue' },
  { index: 3, label: 'lights.window.white' },
];

const sameColor = (left: Chosen, right: Chosen) =>
  left.every((part, index) => part === right[index]);

/**
 * One light with its controls (HAS-268): its bulb and state, when and by whom it changed, on and
 * off, the brightness of a light that dims and the colour of an rgbw light - the controls the
 * window of the lights page has, for the lights card of "My room". Named by the caller, without
 * its room.
 *
 * **No optimistic state**: a command is sent through the caller's `commands` - one command per
 * light at a time, whoever sends it - and the lights are read again (`refresh`) before anything
 * on screen moves. A colour is chosen on three sliders (red, green, blue) and a fourth for white
 * **only for a light that reported a white channel** (a Gen2 RGBW in the profile rgb refuses
 * white, and it is the device that tells); the swatch shows what is chosen, the light what it
 * reported after the read-back.
 */
@Component({
  selector: 'app-light-control',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatSliderModule,
    MatTooltipModule,
    TranslocoDirective,
    DisplayTextPipe,
    HouseAgePipe,
    HouseDateTimePipe,
  ],
  templateUrl: './light-control.html',
  styleUrl: './light-control.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
})
export class LightControl {
  readonly light = input.required<ControlledLight>();
  /** The name shown, already shortened by the caller; the full name names the controls. */
  readonly name = input<string>();
  readonly commands = input.required<DeviceCommands<number>>();
  /** Reads the lights again, resolved when that call has answered. */
  readonly refresh = input.required<() => Promise<void>>();
  /** A command for the whole room is on its way: the light waits for it. */
  readonly roomBusy = input(false);

  private readonly api = inject(LightApi);

  protected readonly LIGHT_STATE_LABELS = LIGHT_STATE_LABELS;
  protected readonly lightSourceText = lightSourceText;
  protected readonly lightFailureOf = lightFailureOf;
  protected readonly cssColorOf = cssColorOf;
  protected readonly TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

  protected readonly state = computed(() => stateOf(this.light()));
  protected readonly command = computed(() => this.commands().stateOf(this.light().id));
  protected readonly busy = computed(() => this.command()?.sending === true || this.roomBusy());
  protected readonly dimmable = computed(() => dims(this.light()));
  protected readonly colourful = computed(() => this.light().kind === 'rgbw');
  /** Whether the light reported a white channel - only then is white offered. */
  protected readonly hasWhite = computed(() => typeof this.light().color?.white === 'number');
  protected readonly colorParts = computed(() =>
    this.hasWhite() ? COLOR_PARTS : COLOR_PARTS.slice(0, 3),
  );

  /** The colour the light reported, white where it reported none - the same until it changes. */
  private readonly reportedColor = computed(
    (): Chosen => {
      const rgb = this.light().color?.rgb;
      const [red, green, blue] = cssColorOf(rgb) !== undefined && rgb ? rgb : WHITE;
      return [red, green, blue, this.light().color?.white ?? 0];
    },
    { equal: sameColor },
  );

  /**
   * The colour being chosen: what the light reported until a slider moves, and again what it
   * reports once that changes - a colour set by a rule or another hand is never shown as chosen.
   */
  protected readonly chosenColor = linkedSignal<Chosen>(() => this.reportedColor());

  protected readonly swatch = computed(() => {
    const [red, green, blue] = this.chosenColor();
    return `rgb(${red}, ${green}, ${blue})`;
  });

  protected choose(part: 0 | 1 | 2 | 3, value: number): void {
    const next = [...this.chosenColor()] as [number, number, number, number];
    next[part] = Math.min(255, Math.max(0, Math.round(value)));
    this.chosenColor.set(next);
  }

  protected turn(on: boolean): void {
    const id = this.light().id;
    this.commands().send(id, this.api.turn(id, on), this.refresh());
  }

  /** 1 ... 100: the service refuses 0 - "off" is the way to switch a light off. */
  protected setBrightness(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }
    const id = this.light().id;
    const brightness = Math.min(100, Math.max(1, Math.round(value)));
    this.commands().send(id, this.api.brightness(id, brightness), this.refresh());
  }

  /** The colour chosen; white only for a light that has it. Switches the light on. */
  protected setColor(): void {
    const id = this.light().id;
    const [red, green, blue, white] = this.chosenColor();
    this.commands().send(
      id,
      this.api.color(id, { rgb: [red, green, blue], ...(this.hasWhite() ? { white } : {}) }),
      this.refresh(),
    );
  }
}
