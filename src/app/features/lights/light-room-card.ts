import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoDirective } from '@jsverse/transloco';

import { CommandState, DeviceCommands } from '../../core/api/device-commands';
import { LightApi, Occupancy, RoomRule, RoomTurnAnswer } from '../../data-access/light/light-api';
import { DisplayText } from '../../i18n/messages';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { shortName } from '../../shared/device-names/device-names';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import {
  LIGHT_STATE_LABELS,
  OCCUPANCY_LABELS,
  dims,
  illuminationText,
  lightSourceText,
  occupancyOf,
  stateOf,
} from '../../shared/lights/light-labels';
import { describeLightError } from '../../shared/lights/light-errors';
import { AddressedLight } from './light-rooms';
import { ruleSummary } from './rule-summary';

/** What the line of the state of a card says: the last failure, or what a room command skipped. */
export interface CardStatus {
  readonly text: DisplayText;
  /** The light it is about, printed as it is, before the text. */
  readonly about?: string;
  /** The lights a room command could not switch, printed as they are, after the text. */
  readonly listed?: string;
}

interface Outcome {
  readonly order: number;
  readonly state: CommandState<unknown>;
  readonly about?: string;
  readonly failed: readonly { readonly name?: string }[];
}

/**
 * The lights of one room (HAS-266) - **a card of one size for every room**, as on the blinds page:
 * the occupancy of the room under its name, a line per light with its state and the two commands,
 * a line for what the last command came to, a line for the rule of the room, and at the bottom
 * "all off" and the button of the window of the room. The page gives every card room for as many
 * lights as the room with the most has (`--light-lines`), so nothing makes one card taller.
 *
 * No optimistic state and no question first: a command is sent, the lights are read again
 * (`refresh`), and only that answer moves the screen. **No switch either** - a toggle would show a
 * light the service says nothing of as off; the state is the bulb and its word, and the commands
 * are two buttons. The commands are the page's: one per light and per room at a time.
 */
@Component({
  selector: 'app-light-room-card',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    TranslocoDirective,
    DisplayTextPipe,
    HouseAgePipe,
    HouseDateTimePipe,
  ],
  templateUrl: './light-room-card.html',
  styleUrl: './light-room-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
})
export class LightRoomCard {
  /** The identifier of the room, printed as it is. */
  readonly room = input.required<string>();
  readonly lights = input.required<readonly AddressedLight[]>();
  readonly occupancy = input<Occupancy>();
  /** The rule of the room; `undefined` without one - or while the rules are not known. */
  readonly rule = input<RoomRule>();
  /** Whether the service answered with its rules: without that, no rule is "not known", not "none". */
  readonly rulesKnown = input(false);
  /** Reads the lights again, resolved when that call has answered. */
  readonly refresh = input.required<() => Promise<void>>();
  readonly commands = input.required<DeviceCommands<number>>();
  readonly roomCommands = input.required<DeviceCommands<string, RoomTurnAnswer | null>>();
  /** The button of the window of the room was pressed. */
  readonly openDetails = output<void>();

  private readonly api = inject(LightApi);

  protected readonly stateOf = stateOf;
  protected readonly dims = dims;
  protected readonly LIGHT_STATE_LABELS = LIGHT_STATE_LABELS;
  protected readonly OCCUPANCY_LABELS = OCCUPANCY_LABELS;
  protected readonly lightSourceText = lightSourceText;
  protected readonly illuminationText = illuminationText;
  protected readonly isLux = isLux;
  protected readonly TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

  /** The lights by name, each named without its room and its kind (the rule of the room view). */
  protected readonly shown = computed(() =>
    [...this.lights()]
      .sort((left, right) => (left.name ?? '').localeCompare(right.name ?? ''))
      .map((light) => ({ light, name: shortName(light.name, this.room(), 'light') })),
  );

  protected readonly occupancyState = computed(() => occupancyOf(this.occupancy()));

  protected readonly summary = computed(() => {
    const rule = this.rule();
    return rule === undefined ? undefined : ruleSummary(rule);
  });

  protected readonly roomState = computed(() => this.roomCommands().stateOf(this.room()));

  /** A light of the room has a command on its way: the room waits for it, and it for the room. */
  protected readonly lightSending = computed(() =>
    this.lights().some((light) => this.commands().stateOf(light.id)?.sending),
  );

  protected readonly roomBusy = computed(() => this.roomState()?.sending === true);

  /**
   * The line of the state: what the newest command of the card came to - the room's or a light's,
   * whichever was sent last. A failure a later command has made old is not told any more; a command
   * still on its way says nothing yet.
   */
  protected readonly status = computed((): CardStatus | undefined => {
    const room = this.roomState();
    const outcomes: Outcome[] = [
      ...(room && !room.sending
        ? [{ order: room.order ?? 0, state: room, failed: failedOf(room.answer) }]
        : []),
      ...this.shown().flatMap(({ light, name }) => {
        const state = this.commands().stateOf(light.id);
        return state && !state.sending
          ? [{ order: state.order ?? 0, state, about: name ?? light.name, failed: [] }]
          : [];
      }),
    ];
    const newest = outcomes.reduce<Outcome | undefined>(
      (best, one) => (best === undefined || one.order > best.order ? one : best),
      undefined,
    );
    if (newest?.state.error) {
      return {
        text: lightFailureOf(newest.state),
        ...(newest.about ? { about: newest.about } : {}),
      };
    }
    return newest === undefined || newest.failed.length === 0
      ? undefined
      : {
          text: { key: 'lights.room.skipped', params: { count: newest.failed.length } },
          listed: newest.failed.map((one) => one.name ?? '?').join(', '),
        };
  });

  protected stateOfCommand(id: number): CommandState | undefined {
    return this.commands().stateOf(id);
  }

  protected turn(light: AddressedLight, on: boolean): void {
    this.commands().send(light.id, this.api.turn(light.id, on), this.refresh());
  }

  protected roomOff(): void {
    this.roomCommands().send(this.room(), this.api.roomTurn(this.room(), false), this.refresh());
  }
}

function failedOf(
  answer: RoomTurnAnswer | null | undefined,
): readonly { readonly name?: string }[] {
  const failed = answer?.failed;
  return Array.isArray(failed) ? failed : [];
}

/** A failed command in words: one that got no answer may have been carried out all the same. */
/** A number of lux: 0 is a reading, anything that is not a number is none. */
export function isLux(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function lightFailureOf(state: CommandState<unknown>): DisplayText {
  const error = state.error;
  return error === undefined || error.kind === 'network'
    ? { key: 'lights.commandFailed' }
    : describeLightError(error);
}
