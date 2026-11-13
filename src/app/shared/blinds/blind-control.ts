import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoDirective } from '@jsverse/transloco';

import { DeviceCommands } from '../../core/api/device-commands';
import { Blind, BlindCommand, BlindsApi } from '../../data-access/blinds/blinds-api';
import { ApiErrorStrip } from '../api-error/api-error-strip';
import { shortName } from '../device-names/device-names';
import { HouseAgePipe } from '../house-age/house-age.pipe';
import { toWindowView } from '../room-heating/room-views';
import { windowStateIcon, windowStateLabel } from '../room-heating/window-labels';
import { blindPositionLabel } from './blind-position';

/**
 * One blind with its controls - open, stop, close, a position for one that can go to one, and the
 * pause of its schedules until their next run (HAS-232) - shared by the window of a room of the
 * room view and the blinds card of "My room" (HAS-254). Named without its room and its kind.
 *
 * **No optimistic state**: a command is sent through the caller's `commands` - one command per
 * blind at a time, whoever sends it - and the blinds are read again (`refresh`) before anything on
 * screen moves. **The pause does not press itself**: its button is pressed while the service says
 * `schedulePausedSince`, also after a pause that failed.
 *
 * The look of an air conditioner (HAS-438, owner 2026-11-13): open / stop / close as one bar, the position
 * by a step of 10 % instead of a slider and "Go", the pause as a button in the look of quiet / turbo /
 * sleep, everything in the middle of the frame.
 */
@Component({
  selector: 'app-blind-control',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    TranslocoDirective,
    ApiErrorStrip,
    HouseAgePipe,
  ],
  templateUrl: './blind-control.html',
  styleUrl: './blind-control.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
})
export class BlindControl {
  /** The id of the device registry - what `blinds-service` addresses. */
  readonly id = input.required<number>();
  readonly name = input<string>();
  /** The room it is shown in: its name is given without the room. */
  readonly room = input.required<string>();
  /** Whether it can be sent to a position; `undefined` is not known, and offers none. */
  readonly positioning = input<boolean>();
  /** What `blinds-service` says of it; `undefined` while the service has not said. */
  readonly state = input<Blind>();
  readonly commands = input.required<DeviceCommands<number>>();
  /** Reads the blinds again, resolved when that call has answered. */
  readonly refresh = input.required<() => Promise<void>>();

  private readonly api = inject(BlindsApi);

  protected readonly windowLabel = windowStateLabel;
  protected readonly windowIcon = windowStateIcon;

  protected readonly shortName = computed(() => shortName(this.name(), this.room(), 'blinds'));
  protected readonly shown = computed(() => blindPositionLabel({ state: this.state() }));
  protected readonly window = computed(() => {
    const window = this.state()?.window;
    return window === undefined ? undefined : toWindowView({ state: window });
  });
  protected readonly command = computed(() => this.commands().stateOf(this.id()));
  /** Whether the service says the schedules of the blind are paused. */
  protected readonly paused = computed(() => this.state()?.schedulePausedSince !== undefined);
  protected readonly POSITION_STEP = 10;

  protected move(command: BlindCommand): void {
    this.commands().send(this.id(), this.api.move(this.id(), command), this.refresh());
  }

  /** The reported position moved by a step, kept within 0-100 %; nothing without a reported position. */
  protected step(by: number): void {
    const at = this.state()?.position;
    if (at !== undefined) {
      const position = Math.min(100, Math.max(0, at + by));
      this.commands().send(this.id(), this.api.moveTo(this.id(), position), this.refresh());
    }
  }

  /** A press asks for the other state; the button moves when the blinds read again say so. */
  protected pause(): void {
    const id = this.id();
    const call =
      this.state()?.schedulePausedSince === undefined
        ? this.api.pauseSchedules(id)
        : this.api.resumeSchedules(id);
    this.commands().send(id, call, this.refresh());
  }
}
