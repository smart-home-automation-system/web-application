import {
  ChangeDetectionStrategy,
  Component,
  Signal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoDirective } from '@jsverse/transloco';

import { CommandState, DeviceCommands } from '../../core/api/device-commands';
import { LightApi, Occupancy, RoomRule, RuleRun } from '../../data-access/light/light-api';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { shortName } from '../../shared/device-names/device-names';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import {
  LIGHT_STATE_LABELS,
  OCCUPANCY_LABELS,
  cssColorOf,
  dims,
  illuminationText,
  lightSourceText,
  occupancyOf,
  runActionText,
  runErrorText,
  runReasonText,
  sensorKindText,
  stateOf,
} from '../../shared/lights/light-labels';
import { isLux, lightFailureOf } from './light-room-card';
import { ROOM_DETAIL_SIZE } from '../rooms/room-detail';
import { AddressedLight } from './light-rooms';
import { periodText } from './rule-summary';

/** What the window of a room is opened with: signals, so that it follows the service. */
export interface LightRoomWindowData {
  readonly room: string;
  readonly lights: Signal<readonly AddressedLight[]>;
  readonly occupancy: Signal<Occupancy | undefined>;
  /** `undefined` while the rules are not known; `{ rule: undefined }` when the room has none. */
  readonly rule: Signal<{ readonly rule?: RoomRule } | undefined>;
  /** The commands to the lights, the page's: one per light at a time, from the card or from here. */
  readonly commands: DeviceCommands<number>;
  /** Whether a command for the whole room is on its way: the lights wait for it, from here too. */
  readonly roomBusy: Signal<boolean>;
  readonly refresh: () => Promise<void>;
}

/** The size of the window: the one of the window of a room on the rooms page. */
export const LIGHT_ROOM_WINDOW_SIZE = ROOM_DETAIL_SIZE;

/** The parts of a color being chosen: red, green, blue, and white where the light has it. */
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

/**
 * One room of the lights page in a window of its own (HAS-266): every light with what the card has
 * no room for - when it changed and by whom, the manual hold, the brightness of a light that dims
 * and the colour of an rgbw light - then the sensors of the room, its rule as stored and what the
 * engine sent there in the last 24 hours. The rule is shown, not written: its editor is HAS-267.
 *
 * A colour is chosen on three sliders (red, green, blue) and a fourth for white - **only for a light
 * that reported a white channel**: a Gen2 RGBW in the profile rgb refuses white, and it is the device,
 * not the registry, that tells (`light-service` README). The swatch shows what is chosen; the light
 * shows what it reported, after the read-back.
 */
@Component({
  selector: 'app-light-room-window',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatSliderModule,
    MatTooltipModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    DisplayTextPipe,
    HouseAgePipe,
    HouseDateTimePipe,
  ],
  templateUrl: './light-room-window.html',
  styleUrl: './light-room-window.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
})
export class LightRoomWindow {
  protected readonly data = inject<LightRoomWindowData>(MAT_DIALOG_DATA);
  private readonly api = inject(LightApi);
  /** What the engine did in the room - its own call, with its own freshness and failure. */
  protected readonly runs = this.api.watchRuns(this.data.room);

  protected readonly stateOf = stateOf;
  protected readonly dims = dims;
  protected readonly cssColorOf = cssColorOf;
  protected readonly LIGHT_STATE_LABELS = LIGHT_STATE_LABELS;
  protected readonly OCCUPANCY_LABELS = OCCUPANCY_LABELS;
  protected readonly lightSourceText = lightSourceText;
  protected readonly illuminationText = illuminationText;
  protected readonly sensorKindText = sensorKindText;
  protected readonly runActionText = runActionText;
  protected readonly runReasonText = runReasonText;
  protected readonly runErrorText = runErrorText;
  protected readonly periodText = periodText;
  protected readonly lightFailureOf = lightFailureOf;
  protected readonly isLux = isLux;
  protected readonly TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  protected readonly DAY_TIME: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  };

  protected readonly shown = computed(() =>
    [...this.data.lights()]
      .sort((left, right) => (left.name ?? '').localeCompare(right.name ?? ''))
      .map((light) => ({ light, name: shortName(light.name, this.data.room, 'light') })),
  );

  protected readonly occupancyState = computed(() => occupancyOf(this.data.occupancy()));

  protected readonly sensors = computed(() => {
    const sensors = this.data.occupancy()?.sensors;
    return Array.isArray(sensors) ? sensors : [];
  });

  /** The runs, newest first; a light named by its name in the room, else by its id. */
  protected readonly runRows = computed(() => {
    const answer: unknown = this.runs.value();
    if (!Array.isArray(answer)) {
      return undefined;
    }
    const names = new Map(this.shown().map(({ light, name }) => [light.id, name ?? light.name]));
    return [...(answer as RuleRun[])]
      .filter((run) => run !== null && typeof run === 'object')
      .sort((left, right) => (right.at ?? '').localeCompare(left.at ?? ''))
      .map((run) => ({
        run,
        light:
          (typeof run.deviceId === 'number' ? names.get(run.deviceId) : undefined) ??
          `#${String(run.deviceId ?? '?')}`,
      }));
  });

  /** The colour being chosen for each rgbw light; a light not touched starts from what it reported. */
  private readonly chosen = signal<ReadonlyMap<number, Chosen>>(new Map());

  protected stateOfCommand(id: number): CommandState | undefined {
    return this.data.commands.stateOf(id);
  }

  /** The sliders of a colour: red, green, blue - and white for a light that has it. */
  protected colorParts(light: AddressedLight): readonly ColorPart[] {
    return this.hasWhite(light) ? COLOR_PARTS : COLOR_PARTS.slice(0, 3);
  }

  /** Whether the light reported a white channel - only then is white offered. */
  protected hasWhite(light: AddressedLight): boolean {
    return typeof light.color?.white === 'number';
  }

  protected chosenOf(light: AddressedLight): Chosen {
    const chosen = this.chosen().get(light.id);
    if (chosen) {
      return chosen;
    }
    const rgb = light.color?.rgb;
    const [red, green, blue] = cssColorOf(rgb) !== undefined && rgb ? rgb : WHITE;
    return [red, green, blue, light.color?.white ?? 0];
  }

  protected choose(light: AddressedLight, part: 0 | 1 | 2 | 3, value: number): void {
    const next = [...this.chosenOf(light)] as [number, number, number, number];
    next[part] = Math.min(255, Math.max(0, Math.round(value)));
    this.chosen.update((all) => new Map(all).set(light.id, next));
  }

  protected swatchOf(light: AddressedLight): string {
    const [red, green, blue] = this.chosenOf(light);
    return `rgb(${red}, ${green}, ${blue})`;
  }

  protected turn(light: AddressedLight, on: boolean): void {
    this.data.commands.send(light.id, this.api.turn(light.id, on), this.data.refresh);
  }

  /** 1 ... 100: the service refuses 0 - "off" is the way to switch a light off. */
  protected setBrightness(light: AddressedLight, value: number): void {
    const brightness = Math.min(100, Math.max(1, Math.round(value)));
    this.data.commands.send(light.id, this.api.brightness(light.id, brightness), this.data.refresh);
  }

  /** The colour chosen; white only for a light that has it. Switches the light on. */
  protected setColor(light: AddressedLight): void {
    const [red, green, blue, white] = this.chosenOf(light);
    this.data.commands.send(
      light.id,
      this.api.color(light.id, {
        rgb: [red, green, blue],
        ...(this.hasWhite(light) ? { white } : {}),
      }),
      this.data.refresh,
    );
  }
}
