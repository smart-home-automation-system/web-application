import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoDirective } from '@jsverse/transloco';

import { CommandState, DeviceCommands } from '../../core/api/device-commands';
import { Blind, BlindCommand, BlindOutcome, BlindsApi } from '../../data-access/blinds/blinds-api';
import { DisplayText } from '../../i18n/messages';
import { blindPositionLabel } from '../../shared/blinds/blind-position';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { doorsFirst, shortName } from '../../shared/device-names/device-names';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { describeBlindsError } from './blinds-errors';
import { sourceText } from './blind-labels';

/** A blind the page can address: one with an id. */
export type AddressedBlind = Blind & { readonly id: number };

/** The positions a blind with `positioning` is offered, 0 closed ... 100 open. */
export const POSITIONS = [0, 25, 50, 75, 100] as const;

/** What the line of the state of a card says: the last failure, or what a command skipped. */
export interface CardStatus {
  readonly text: DisplayText;
  /** The blinds or the blind it is about, printed as they are. */
  readonly about?: string;
}

/**
 * The blinds of one room (HAS-252) - **a card of one size for every room** (owner, 2026-10-18):
 * a line per blind with its position and its three commands, a line for what the last command
 * came to, and the commands of the room with the button of its schedules at the bottom. The page
 * gives every card room for as many blinds as the room with the most has (`--blind-lines`), and a
 * failure takes the one line reserved for it, so nothing makes one card taller than another.
 *
 * No optimistic state and no question first (the rule of the room view, owner 2026-10-17): a
 * command is sent, the blinds are read again (`refresh`), and only that answer moves the screen.
 * The commands are the page's (`commands`, `roomCommands`): one per blind and per room at a time,
 * whichever card or window sends it.
 */
@Component({
  selector: 'app-blind-room-card',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    TranslocoDirective,
    DisplayTextPipe,
    HouseAgePipe,
  ],
  templateUrl: './blind-room-card.html',
  styleUrl: './blind-room-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
})
export class BlindRoomCard {
  /** The identifier of the room, printed as it is. */
  readonly room = input.required<string>();
  readonly blinds = input.required<readonly AddressedBlind[]>();
  /** How many schedules move a blind of the room; `undefined` while not known. */
  readonly schedules = input<number>();
  /** Reads the blinds again, resolved when that call has answered. */
  readonly refresh = input.required<() => Promise<void>>();
  readonly commands = input.required<DeviceCommands<number>>();
  readonly roomCommands = input.required<DeviceCommands<string, readonly BlindOutcome[]>>();
  /** A command for the whole house is on its way: the rooms wait for it. */
  readonly houseBusy = input(false);
  /** The button of the schedules of the room was pressed. */
  readonly openSchedules = output<void>();

  private readonly api = inject(BlindsApi);

  protected readonly POSITIONS = POSITIONS;
  protected readonly positionLabel = blindPositionLabel;
  protected readonly sourceText = sourceText;

  /** The blinds as the owner reads them: the door first, then the windows by name (HAS-232). */
  protected readonly shown = computed(() =>
    [...this.blinds()].sort(doorsFirst).map((blind) => ({
      blind,
      name: shortName(blind.name, this.room(), 'blinds'),
    })),
  );

  protected readonly roomState = computed(() => this.roomCommands().stateOf(this.room()));

  /** A blind of the room has a command on its way: the room waits for it, and it for the room. */
  protected readonly blindSending = computed(() =>
    this.blinds().some((blind) => this.commands().stateOf(blind.id)?.sending),
  );

  protected readonly roomBusy = computed(
    () => this.roomState()?.sending === true || this.houseBusy(),
  );

  /** The line of the state: a room command first, then the failure of a blind. */
  protected readonly status = computed((): CardStatus | undefined => {
    const room = this.roomState();
    if (room?.error) {
      return { text: failureOf(room) };
    }
    const skipped = room?.answer ?? [];
    if (skipped.length > 0) {
      return {
        text: { key: 'blinds.room.skipped', params: { count: skipped.length } },
        about: skipped.map((one) => one.name ?? '?').join(', '),
      };
    }
    for (const { blind, name } of this.shown()) {
      const state = this.commands().stateOf(blind.id);
      if (state?.error) {
        return { text: failureOf(state), about: name ?? blind.name };
      }
    }
    return undefined;
  });

  protected stateOf(id: number) {
    return this.commands().stateOf(id);
  }

  protected move(blind: AddressedBlind, command: BlindCommand): void {
    this.commands().send(blind.id, this.api.move(blind.id, command), this.refresh());
  }

  protected moveTo(blind: AddressedBlind, position: number): void {
    this.commands().send(blind.id, this.api.moveTo(blind.id, position), this.refresh());
  }

  protected moveRoom(command: BlindCommand): void {
    this.roomCommands().send(this.room(), this.api.moveRoom(this.room(), command), this.refresh());
  }
}

/** A failed command in words: one that got no answer may have been carried out all the same. */
export function failureOf(state: CommandState<unknown>): DisplayText {
  const error = state.error;
  return error === undefined || error.kind === 'network'
    ? { key: 'blindControl.commandFailed' }
    : describeBlindsError(error);
}
