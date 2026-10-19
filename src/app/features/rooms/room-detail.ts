import { ChangeDetectionStrategy, Component, Signal, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { TranslocoDirective } from '@jsverse/transloco';

import { CommandState, DeviceCommands } from '../../core/api/device-commands';
import { LightApi } from '../../data-access/light/light-api';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { describeLightError } from '../../shared/lights/light-errors';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import {
  heaterKindLabel,
  heaterState,
  heaterStateLabel,
} from '../../shared/room-heating/heater-labels';
import { windowStateLabel } from '../../shared/room-heating/window-labels';
import { BlindControl } from '../../shared/blinds/blind-control';
import { shortName } from '../../shared/device-names/device-names';
import { LightRow, RoomOverview, dims, lightState, lightStateLabel } from './room-overview';

/** What the window of a room is opened with: signals, so that it follows the services. */
export interface RoomDetailData {
  readonly overview: Signal<RoomOverview>;
  /** The key of the name of the floor the room lies on. */
  readonly floor: MessageKey;
  /** Reads the blinds again, resolved when that call has answered. */
  readonly refreshBlinds: () => Promise<void>;
  /** Reads the lights again, resolved when that call has answered. */
  readonly refreshLights: () => Promise<void>;
}

/** The size of the window, the same for every room - the devices page's. */
export const ROOM_DETAIL_SIZE = {
  width: 'min(760px, calc(100vw - 32px))',
  height: 'min(760px, calc(100dvh - 48px))',
  maxWidth: '100vw',
} as const;

/**
 * The devices of one room in a window of their own (HAS-232), by the owner's rows, with what the
 * services know of each - and **the two things that can be changed from a room: the lights and
 * the blinds** (owner, 2026-10-17). The heating is shown and set on the heating page only.
 *
 * A command is sent at once, without a question (owner, 2026-10-17: frequent and reversible -
 * the question stays for the switch of the heating of the whole house). There is no optimistic
 * state: after a command to a blind the blinds are read again and only their answer moves what
 * is on screen - the blinds after a command to a blind, the lights (`light-service`, HAS-292)
 * after a command to a light.
 */
@Component({
  selector: 'app-room-detail',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatSliderModule,
    TranslocoDirective,
    ApiErrorStrip,
    BlindControl,
    HouseAgePipe,
    HouseDateTimePipe,
    LocalNumberPipe,
  ],
  templateUrl: './room-detail.html',
  styleUrl: './room-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  preserveWhitespaces: true,
})
export class RoomDetail {
  protected readonly data = inject<RoomDetailData>(MAT_DIALOG_DATA);
  private readonly lightApi = inject(LightApi);

  /** One command per device at a time, the device read again before the next one. */
  protected readonly commands = new DeviceCommands<number>();

  protected readonly ONE_DECIMAL: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };
  protected readonly heaterKindLabel = heaterKindLabel;
  protected readonly heaterStateLabel = heaterStateLabel;
  protected readonly heaterState = heaterState;
  protected readonly windowLabel = windowStateLabel;
  protected readonly shortName = shortName;
  protected readonly lightState = lightState;
  protected readonly lightStateLabel = lightStateLabel;
  protected readonly dims = dims;
  protected readonly describeLightError = describeLightError;
  protected readonly TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

  // a blind is read again after every command; only that answer moves what is on screen
  protected readonly readBack = () => this.data.refreshBlinds();

  protected stateOf(id: number): CommandState | undefined {
    return this.commands.stateOf(id);
  }

  // a light is read again after every command; only that answer moves what is on screen
  private readonly readLights = () => this.data.refreshLights();

  protected switchLight(light: LightRow, on: boolean): void {
    this.commands.send(light.device.id, this.lightApi.turn(light.device.id, on), this.readLights);
  }

  /** 1 ... 100: the service refuses 0 - "off" is the way to switch a light off. */
  protected setBrightness(light: LightRow, value: number): void {
    const brightness = Math.min(100, Math.max(1, Math.round(value)));
    this.commands.send(
      light.device.id,
      this.lightApi.brightness(light.device.id, brightness),
      this.readLights,
    );
  }
}
