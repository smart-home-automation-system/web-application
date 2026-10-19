import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { DeviceCommands } from '../../core/api/device-commands';
import { BlindsApi } from '../../data-access/blinds/blinds-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { BlindControl } from '../../shared/blinds/blind-control';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { doorsFirst } from '../../shared/device-names/device-names';
import { blindsOf } from '../../shared/blinds/addressed-blind';
import { describeBlindsError } from '../blinds/blinds-errors';

/**
 * The blinds of one room on "My room" (HAS-254): each with its position and its controls - open,
 * stop, close, a position, and the pause of its schedules until their next run - the door first,
 * each named without the room. **No schedules**: they are the administrator's, on the blinds page.
 *
 * The control of the blinds is what lifts the rule that nothing on "My room" can be pressed
 * (owner, 2026-10-18): a member whose profile has the room controls its blinds, no permission
 * needed. **No card for a room without blinds** (the service's 404 `NOT_FOUND_BLINDS`, or an empty
 * list) - also while the first answer is on its way; any other failure before an answer is told,
 * since nobody knows then whether the room has blinds.
 *
 * Nothing optimistic: a command is followed by a read of the room, and only that answer moves the
 * screen (the shared `BlindControl`).
 */
@Component({
  selector: 'app-room-blinds',
  imports: [
    MatCardModule,
    MatIconModule,
    TranslocoDirective,
    ApiErrorStrip,
    BlindControl,
    DataFreshness,
  ],
  templateUrl: './room-blinds.html',
  styleUrl: './room-blinds.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomBlinds {
  /** The identifier of the room in the backend, as the registry gives it to the profile. */
  readonly room = input.required<string>();

  // the name is read when a call is made - by then the input is set, and it never changes
  protected readonly answer = inject(BlindsApi).watchRoom(() => this.room());
  protected readonly commands = new DeviceCommands<number>();
  protected readonly refresh = () => this.answer.refresh();
  protected readonly describeError = describeBlindsError;

  /**
   * `blinds-service` answers a room without blinds with a 404 and the code `NOT_FOUND_BLINDS` -
   * an answer, not an outage (found on the live page, 2026-10-18: the room of a member without
   * blinds showed the failure). It wins over the last answer the resource still holds: the blinds
   * of a room that has none now are not shown as they were.
   */
  private readonly none = computed(() => this.answer.error()?.hasCode('NOT_FOUND_BLINDS') === true);

  /** The blinds of the room, the door first; `undefined` while the service has not answered with them. */
  protected readonly blinds = computed(() => {
    if (this.none()) {
      return [];
    }
    const answer = this.answer.value();
    const blinds = blindsOf(answer === undefined || answer === null ? undefined : [answer]);
    return blinds === undefined ? undefined : [...blinds].sort(doorsFirst);
  });

  /** Whether the card is shown: the room has blinds, or nothing is known of them but a failure. */
  protected readonly shown = computed(() => {
    const blinds = this.blinds();
    return blinds === undefined ? this.answer.error() !== undefined : blinds.length > 0;
  });
}
