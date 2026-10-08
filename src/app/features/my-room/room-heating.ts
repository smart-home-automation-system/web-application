import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { HeatingApi } from '../../data-access/heating/heating-api';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import {
  heaterKindIcon,
  heaterKindLabel,
  heaterState,
  heaterStateLabel,
} from '../../shared/room-heating/heater-labels';
import { HeaterWeek } from '../../shared/room-heating/heater-week';
import { toRoomViews } from '../../shared/room-heating/room-views';

/**
 * The temperature and the heating of one room, strictly read-only: the temperature with the age
 * of its reading, the humidity when the service reports one, the temperature the schedule asks
 * for right now, each heater with what its relay last reported, and today's schedule. Nothing
 * here can be pressed - setting a temperature or a schedule is the administrator's alone.
 *
 * The card is created anew for every room (see `ROOM_CAPABILITIES`), so its one call is for one
 * room for as long as it lives. What the service has not measured, heard from a relay or decided
 * is said to be unknown, never drawn as cold or off; a room the heating service does not know -
 * the registry may name one - is told as that, not as a failure.
 */
@Component({
  selector: 'app-room-heating',
  imports: [
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    HouseAgePipe,
    LocalNumberPipe,
    HeaterWeek,
  ],
  templateUrl: './room-heating.html',
  styleUrl: './room-heating.scss',
  // rows of several pieces of text side by side: they are read with the space between them
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomHeating {
  /** The identifier of the room in the backend, as the registry gives it to the profile. */
  readonly room = input.required<string>();

  // the name is read when a call is made - by then the input is set, and it never changes
  protected readonly answer = inject(HeatingApi).watchRoom(() => this.room());

  /** The room as the service answered it; `undefined` when the answer is not a room. */
  protected readonly view = computed(() => toRoomViews([this.answer.value()]).at(0));

  /** The heating service has no room of this name: an answer, not an outage. */
  protected readonly unknownRoom = computed(
    () => this.answer.error()?.hasCode('NOT_FOUND_ROOM') === true,
  );

  protected readonly ONE_DECIMAL: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };
  protected readonly TARGET: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };
  protected readonly WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };

  protected readonly kindLabel = heaterKindLabel;
  protected readonly kindIcon = heaterKindIcon;
  protected readonly stateLabel = heaterStateLabel;
  protected readonly state = heaterState;
}
