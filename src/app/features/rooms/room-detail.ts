import { ChangeDetectionStrategy, Component, Signal, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import {
  MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS,
  MatSlideToggleModule,
} from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { Observable } from 'rxjs';

import { ApiError, toApiError } from '../../core/api/api-error';
import { BlindCommand, BlindsApi } from '../../data-access/blinds/blinds-api';
import { RegisteredDevice } from '../../data-access/devices/device-registry-api';
import { LightsApi } from '../../data-access/lights/lights-api';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import {
  heaterKindLabel,
  heaterState,
  heaterStateLabel,
} from '../../shared/room-heating/heater-labels';
import { windowStateIcon, windowStateLabel } from '../../shared/room-heating/window-labels';
import { BlindSchedules } from './blind-schedules';
import { BlindRow, RoomOverview } from './room-overview';
import { blindPositionLabel } from './room-labels';

/** What the window of a room is opened with: signals, so that it follows the services. */
export interface RoomDetailData {
  readonly overview: Signal<RoomOverview>;
  /** The key of the name of the floor the room lies on. */
  readonly floor: MessageKey;
  /** Reads the blinds again, resolved when that call has answered. */
  readonly refreshBlinds: () => Promise<void>;
}

/** The size of the window, the same for every room - the devices page's. */
export const ROOM_DETAIL_SIZE = {
  width: 'min(760px, calc(100vw - 32px))',
  height: 'min(760px, calc(100dvh - 48px))',
  maxWidth: '100vw',
} as const;

/** How a command to one device went, by its id. */
interface CommandState {
  readonly sending: boolean;
  readonly error?: ApiError;
  /** A light only: the frame went out - its state is still not known. */
  readonly sent?: boolean;
}

/**
 * The devices of one room in a window of their own (HAS-232), by the owner's rows, with what the
 * services know of each - and **the two things that can be changed from a room: the lights and
 * the blinds** (owner, 2026-10-17). The heating is shown and set on the heating page only.
 *
 * A command is sent at once, without a question (owner, 2026-10-17: frequent and reversible -
 * the question stays for the switch of the heating of the whole house). There is no optimistic
 * state: after a command to a blind the blinds are read again and only their answer moves what
 * is on screen; a light has no state any service keeps yet, so it is told as sent, never as on.
 */
@Component({
  selector: 'app-room-detail',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatSlideToggleModule,
    MatSliderModule,
    RouterLink,
    TranslocoDirective,
    ApiErrorStrip,
    BlindSchedules,
    HouseAgePipe,
    LocalNumberPipe,
  ],
  templateUrl: './room-detail.html',
  styleUrl: './room-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
  providers: [
    { provide: MAT_SLIDE_TOGGLE_DEFAULT_OPTIONS, useValue: { disableToggleValue: true } },
  ],
})
export class RoomDetail {
  protected readonly data = inject<RoomDetailData>(MAT_DIALOG_DATA);
  private readonly blindsApi = inject(BlindsApi);
  private readonly lightsApi = inject(LightsApi);

  protected readonly commands = signal<ReadonlyMap<number, CommandState>>(new Map());

  protected readonly ONE_DECIMAL: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };
  protected readonly heaterKindLabel = heaterKindLabel;
  protected readonly heaterStateLabel = heaterStateLabel;
  protected readonly heaterState = heaterState;
  protected readonly windowLabel = windowStateLabel;
  protected readonly windowIcon = windowStateIcon;
  protected readonly positionLabel = blindPositionLabel;

  /** The point of an Eaton light, which is what `amx-service` switches; `undefined` for any other light. */
  protected eatonPoint(light: RegisteredDevice): number | undefined {
    const point = light.eaton?.point;
    return light.vendor === 'eaton' && typeof point === 'number' && Number.isFinite(point)
      ? point
      : undefined;
  }

  protected stateOf(id: number): CommandState | undefined {
    return this.commands().get(id);
  }

  protected switchLight(light: RegisteredDevice, on: boolean): void {
    const point = this.eatonPoint(light);
    if (point !== undefined) {
      this.send(light.id, this.lightsApi.switch(point, on), false);
    }
  }

  protected setLevel(light: RegisteredDevice, level: number): void {
    const point = this.eatonPoint(light);
    if (point !== undefined) {
      this.send(light.id, this.lightsApi.setLevel(point, level), false);
    }
  }

  protected move(blind: BlindRow, command: BlindCommand): void {
    this.send(blind.device.id, this.blindsApi.move(blind.device.id, command), true);
  }

  protected moveTo(blind: BlindRow, position: number): void {
    this.send(blind.device.id, this.blindsApi.moveTo(blind.device.id, position), true);
  }

  /**
   * The switch shows what the service says, not the click: it does not flip itself
   * (`disableToggleValue`), and moves when the blinds read again say the pause began or ended -
   * a pause that failed leaves it as it was (found in review). A click asks for the other state.
   */
  protected pause(blind: BlindRow): void {
    const paused = blind.state?.schedulePausedSince === undefined;
    const id = blind.device.id;
    this.send(
      id,
      paused ? this.blindsApi.pauseSchedules(id) : this.blindsApi.resumeSchedules(id),
      true,
    );
  }

  /**
   * One command per device at a time. The answer is not used: a blind is read again, whatever
   * came of it - a command that got no answer may have been carried out - and only then is the
   * device free for the next one. A write on its way is not aborted with the window.
   */
  private send(id: number, call: Observable<void>, readBack: boolean): void {
    if (this.stateOf(id)?.sending) {
      return;
    }
    this.set(id, { sending: true });
    const done = (state: CommandState) => {
      if (!readBack) {
        this.set(id, state);
        return;
      }
      void this.data.refreshBlinds().then(() => this.set(id, state));
    };
    call.subscribe({
      error: (failure: unknown) => done({ sending: false, error: toApiError(failure) }),
      complete: () => done({ sending: false, sent: true }),
    });
  }

  private set(id: number, state: CommandState): void {
    this.commands.update((all) => new Map(all).set(id, state));
  }
}
