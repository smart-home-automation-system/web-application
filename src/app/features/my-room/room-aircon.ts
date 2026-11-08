import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { DeviceCommands } from '../../core/api/device-commands';
import { AirconApi } from '../../data-access/aircon/aircon-api';
import { AirconControl } from '../../shared/aircon/aircon-control';
import { describeAirconError } from '../../shared/aircon/aircon-labels';
import { airconReadBack } from '../../shared/aircon/aircon-read-back';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { shortName } from '../../shared/device-names/device-names';

/**
 * The air conditioning of one room on "My room" (HAS-394): every unit of the room
 * (`GET /aircon/rooms/{room}` every 10 s) with its state and its controls (`AirconControl`) - on and
 * off, the mode, the target, the fan, quiet / turbo / sleep. Pressable by the membership of the room,
 * no permission (owner, as the lights and the blinds). **No card for a room without a unit** - the
 * 404 `NOT_FOUND_ROOM`, or an empty list - also while the first answer is on its way; any other
 * failure before an answer is told. Nothing optimistic: a command is followed by two reads of the
 * room (`airconReadBack`), and only those answers move the card.
 */
@Component({
  selector: 'app-room-aircon',
  imports: [
    MatCardModule,
    MatIconModule,
    TranslocoDirective,
    AirconControl,
    ApiErrorStrip,
    DataFreshness,
  ],
  templateUrl: './room-aircon.html',
  styleUrl: './room-aircon.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomAircon {
  /** The identifier of the room in the backend, as the registry gives it to the profile. */
  readonly room = input.required<string>();

  private readonly api = inject(AirconApi);
  // the name is read when a call is made - by then the input is set, and it never changes
  protected readonly answer = this.api.watchRoom(() => this.room());
  protected readonly commands = new DeviceCommands<number>();
  protected readonly refresh = airconReadBack(() => this.answer.refresh());
  protected readonly describeError = describeAirconError;

  /** `aircon-service` answers a room without a unit with this code: no card, not a failure. */
  protected readonly none = computed(() => this.answer.error()?.hasCode('NOT_FOUND_ROOM') === true);

  /** The units by name, each named without its room and its kind; `undefined` while not answered. */
  protected readonly units = computed(() => {
    if (this.none()) {
      return [];
    }
    const answer = this.answer.value();
    return answer === undefined || answer === null
      ? undefined
      : answer
          .filter((unit) => unit.id !== undefined)
          .map((unit) => ({ unit, name: shortName(unit.name, this.room(), 'aircon') }));
  });

  /** Whether the card is shown: the room has a unit, or nothing is known of it but a failure. */
  protected readonly shown = computed(() => {
    const units = this.units();
    return units === undefined ? this.answer.error() !== undefined : units.length > 0;
  });
}
