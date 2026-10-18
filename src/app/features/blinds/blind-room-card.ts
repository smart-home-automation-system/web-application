import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import {
  MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS,
  MatSlideToggleModule,
} from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoDirective } from '@jsverse/transloco';

import { DeviceCommands } from '../../core/api/device-commands';
import { Blind, BlindCommand, BlindOutcome, BlindsApi } from '../../data-access/blinds/blinds-api';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DisplayTextPipe } from '../../shared/display-text/display-text.pipe';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { toWindowView } from '../../shared/room-heating/room-views';
import { windowStateIcon, windowStateLabel } from '../../shared/room-heating/window-labels';
import { blindPositionLabel } from '../../shared/blinds/blind-position';
import { doorsFirst, shortName } from '../../shared/device-names/device-names';
import { describeBlindsError, skippedReason } from './blinds-errors';
import { sourceText } from './blind-labels';

/** A blind the page can address: one with an id. */
export type AddressedBlind = Blind & { readonly id: number };

/**
 * The blinds of one room (HAS-252): every blind with what `blinds-service` says of it and its
 * controls, and the commands for the room as a whole in the header. The card is made for one
 * room and lives as long as the room is on the page, so what a command left - its failure, the
 * blinds a room command skipped - stays with it.
 *
 * No optimistic state and no question first (the rule of the room view, owner 2026-10-17): a
 * command is sent, the blinds are read again (`refresh`), and only that answer moves the screen.
 */
@Component({
  selector: 'app-blind-room-card',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatSlideToggleModule,
    MatSliderModule,
    MatTooltipModule,
    TranslocoDirective,
    ApiErrorStrip,
    DisplayTextPipe,
    HouseAgePipe,
  ],
  templateUrl: './blind-room-card.html',
  styleUrl: './blind-room-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
  providers: [
    // the pause switch shows what the service says, never the click (HAS-232, found in review)
    { provide: MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS, useValue: { disableToggleValue: true } },
  ],
})
export class BlindRoomCard {
  /** The identifier of the room, printed as it is. */
  readonly room = input.required<string>();
  /** The key of the name of the floor it lies on. */
  readonly floor = input.required<MessageKey>();
  readonly blinds = input.required<readonly AddressedBlind[]>();
  /** Reads the blinds again, resolved when that call has answered. */
  readonly refresh = input.required<() => Promise<void>>();
  /**
   * The commands to the blinds, the page's: a blind's pause is also sent from the card of a
   * schedule, and one command per blind at a time holds across both.
   */
  readonly commands = input.required<DeviceCommands<number>>();

  private readonly api = inject(BlindsApi);
  private readonly roomCommands = new DeviceCommands<'room', readonly BlindOutcome[]>();

  protected readonly positionLabel = blindPositionLabel;
  protected readonly windowLabel = windowStateLabel;
  protected readonly windowIcon = windowStateIcon;
  protected readonly sourceText = sourceText;
  protected readonly describeError = describeBlindsError;
  protected readonly skippedReasonOf = skippedReason;

  /** The blinds as the owner reads them: the door first, then the windows by name (HAS-232). */
  protected readonly shown = computed(() =>
    [...this.blinds()].sort(doorsFirst).map((blind) => ({
      blind,
      name: shortName(blind.name, this.room(), 'blinds'),
      window: toWindowView({ state: blind.window })?.state,
    })),
  );

  protected readonly roomCommand = computed(() => this.roomCommands.stateOf('room'));

  /** A blind of the room has a command on its way: the room waits for it, and it for the room. */
  protected readonly blindSending = computed(() =>
    this.blinds().some((blind) => this.commands().stateOf(blind.id)?.sending),
  );

  /** The blinds a room command skipped, by their names as the answer gave them. */
  protected readonly skipped = computed(() => this.roomCommand()?.answer ?? []);

  protected stateOf(id: number) {
    return this.commands().stateOf(id);
  }

  protected move(blind: AddressedBlind, command: BlindCommand): void {
    this.commands().send(blind.id, this.api.move(blind.id, command), this.refresh());
  }

  protected moveTo(blind: AddressedBlind, position: number): void {
    this.commands().send(blind.id, this.api.moveTo(blind.id, position), this.refresh());
  }

  /** A click asks for the other state; the switch moves when the read-back says so. */
  protected pause(blind: AddressedBlind): void {
    const call =
      blind.schedulePausedSince === undefined
        ? this.api.pauseSchedules(blind.id)
        : this.api.resumeSchedules(blind.id);
    this.commands().send(blind.id, call, this.refresh());
  }

  protected moveRoom(command: BlindCommand): void {
    this.roomCommands.send('room', this.api.moveRoom(this.room(), command), this.refresh());
  }
}
