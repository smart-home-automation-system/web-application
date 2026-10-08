import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { HeatingApi } from '../../data-access/heating/heating-api';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { HeaterWeek } from './heater-week';
import { HeaterKind, HeaterView, groupByFloor, toRoomViews } from './room-views';

const KIND_LABELS: Record<HeaterKind, MessageKey> = {
  radiator: 'heating.rooms.heater.radiator',
  floor: 'heating.rooms.heater.floor',
  other: 'heating.rooms.heater.other',
};

const KIND_ICONS: Record<HeaterKind, string> = {
  radiator: 'heat',
  floor: 'floor',
  other: 'device_thermostat',
};

/**
 * The rooms of the house, floor by floor: per room its temperature with the age of the reading,
 * the temperature its schedule asks for right now, and each heater with what its relay last
 * reported. A room opens in place into the week of its heaters, read-only.
 *
 * One call feeds all of it, so it is one card: the freshness and a failure are told once. The
 * freshness is that of the call - the service answers from its memory, which is why every
 * reading and every relay report is shown with its own age. What the service has not measured,
 * heard from a relay or decided yet is said to be unknown, never drawn as cold or off: right
 * after a start of the service most rooms have a temperature and nothing else.
 */
@Component({
  selector: 'app-heating-rooms',
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
  templateUrl: './rooms.html',
  styleUrl: './rooms.scss',
  // a card is rows of several pieces of text side by side: stripped of the white space between
  // them a screen reader and the clipboard get "heatingCalls for heat"
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Rooms {
  protected readonly rooms = inject(HeatingApi).watchRooms();

  protected readonly floors = computed(() => groupByFloor(toRoomViews(this.rooms.value())));

  /** The identifier of the room whose week is shown; one at a time. */
  protected readonly open = signal<string | undefined>(undefined);

  protected readonly ONE_DECIMAL: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };
  protected readonly TARGET: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };

  protected toggle(room: string): void {
    this.open.update((current) => (current === room ? undefined : room));
  }

  protected kindLabel(heater: HeaterView): MessageKey {
    return KIND_LABELS[heater.kind];
  }

  protected kindIcon(heater: HeaterView): string {
    return KIND_ICONS[heater.kind];
  }

  /** What the relay last reported, in words - "no status yet" where it has not. */
  protected stateLabel(heater: HeaterView): MessageKey {
    if (heater.working === undefined) {
      return 'heating.rooms.heater.noStatus';
    }
    return heater.working ? 'heating.rooms.heater.on' : 'heating.rooms.heater.off';
  }

  /** An address inside the page for the panel of a room: the identifier without its spaces. */
  protected panelId(room: string): string {
    return `room-panel-${room.replace(/[^a-z0-9]+/gi, '-')}`;
  }
}
