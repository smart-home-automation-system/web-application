import { Injectable, inject } from '@angular/core';

import { DeviceCommands } from '../../core/api/device-commands';
import { SafetyApi, SafetyCommand } from './safety-api';

/**
 * When the detectors are read once more after a command (HAS-469): the base answers a mute or a self test with a
 * new state a moment after `safety-service` took the command (its 202), so the read right after the 202 may still
 * answer the state before - the pattern of the air conditioners and the lights (2.5 s).
 */
export const SAFETY_READ_AGAIN_AFTER_MS = 2_500;

/**
 * The fire detectors, polled once for the whole application (HAS-469, the pattern of `ApplianceStore`): the banner of
 * a fire alarm is on every page, and the tile of the overview, the card of My room and the safety page read the same
 * resource - two pollers would ask twice and could tell an alarm in one place and none in the other. It lives as long
 * as the application and is created by the first reader: the notices of the shell, which make it only once a member
 * has a profile.
 *
 * The commands of a detector are the store's too, so that a mute pressed on the banner and on the page are one
 * command per detector (`DeviceCommands`): sent, then the detectors read at once and again 2.5 s later - only those
 * answers move anything on screen; the answer of the `POST` is never used.
 */
@Injectable({ providedIn: 'root' })
export class SafetyStore {
  private readonly api = inject(SafetyApi);
  readonly safety = this.api.watchSafety();
  /** By `<command>-<id>`: one mute and one self test per detector at a time. */
  readonly commands = new DeviceCommands<string>();

  /** The key of a command in `commands`. */
  static keyOf(id: number, command: SafetyCommand): string {
    return `${command}-${id}`;
  }

  /** Sends the command once and reads the detectors back - a command without an answer may have been carried out. */
  send(id: number, command: SafetyCommand): void {
    this.commands.send(SafetyStore.keyOf(id, command), this.api.command(id, command), () => {
      setTimeout(() => void this.safety.refresh(), SAFETY_READ_AGAIN_AFTER_MS);
      return this.safety.refresh();
    });
  }
}

/**
 * The technical monitor of `safety-service` (`GET /safety/status`), for the administrator alone: the base card of the
 * safety page and the silent base on the banner read the same resource. Created by the first reader - the notices,
 * once the profile is the administrator's, or the safety page (the administrator's). Known limit: once made it polls
 * for the life of the application, also after the registry made the administrator a resident (until a reload) - the
 * banner then shows nothing of it.
 */
@Injectable({ providedIn: 'root' })
export class SafetyStatusStore {
  readonly status = inject(SafetyApi).watchStatus();
}
