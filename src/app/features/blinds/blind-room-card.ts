import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoDirective } from '@jsverse/transloco';

import { CommandState, DeviceCommands } from '../../core/api/device-commands';
import { BlindCommand, BlindOutcome, BlindsApi } from '../../data-access/blinds/blinds-api';
import { DisplayText } from '../../i18n/messages';
import { blindPositionLabel } from '../../shared/blinds/blind-position';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { doorsFirst, shortName } from '../../shared/device-names/device-names';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { describeBlindsError } from './blinds-errors';
import { sourceText } from './blind-labels';

/** A blind the page can address: one with an id. */
import { AddressedBlind } from '../../shared/blinds/addressed-blind';

export type { AddressedBlind };

/** The positions a blind with `positioning` is offered, 0 closed ... 100 open. */
export const POSITIONS = [0, 25, 50, 75, 100] as const;

/** A command of the card that has come to an end, for the line of the state. */
interface Outcome {
  readonly order: number;
  readonly state: CommandState<unknown>;
  /** The blind it was for, by its name on the card; none for the room. */
  readonly about?: string;
  readonly skipped: readonly BlindOutcome[];
}

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

  /**
   * The line of the state: what the newest command of the card came to - the room's or a blind's,
   * whichever was sent last. A failure a later command has made old is not told any more (found
   * in review); a command still on its way says nothing yet.
   */
  protected readonly status = computed((): CardStatus | undefined => {
    const room = this.roomState();
    const outcomes: Outcome[] = [
      ...(room && !room.sending
        ? [{ order: room.order ?? 0, state: room, skipped: room.answer ?? [] }]
        : []),
      ...this.shown().flatMap(({ blind, name }) => {
        const state = this.commands().stateOf(blind.id);
        return state && !state.sending
          ? [{ order: state.order ?? 0, state, about: name ?? blind.name, skipped: [] }]
          : [];
      }),
    ];
    const newest = outcomes.reduce<Outcome | undefined>(
      (best, one) => (best === undefined || one.order > best.order ? one : best),
      undefined,
    );
    if (newest?.state.error) {
      return { text: failureOf(newest.state), ...(newest.about ? { about: newest.about } : {}) };
    }
    return newest === undefined || newest.skipped.length === 0
      ? undefined
      : {
          text: { key: 'blinds.room.skipped', params: { count: newest.skipped.length } },
          about: newest.skipped.map((one) => one.name ?? '?').join(', '),
        };
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
