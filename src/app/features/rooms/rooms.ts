import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoDirective } from '@jsverse/transloco';

import { ProfileStore } from '../../core/profile/profile-store';
import { isRecord } from '../../core/util/is-record';
import { BlindsApi } from '../../data-access/blinds/blinds-api';
import { DeviceRegistryApi, RegisteredDevice } from '../../data-access/devices/device-registry-api';
import { HeatingApi } from '../../data-access/heating/heating-api';
import { PresenceApi } from '../../data-access/presence/presence-api';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { DataFreshness } from '../../shared/data-freshness/data-freshness';
import { toRoomViews } from '../../shared/room-heating/room-views';
import { groupByFloor } from '../devices/device-groups';
import { ROOM_DETAIL_SIZE, RoomDetail, RoomDetailData } from './room-detail';
import { RoomOverview, toRoomOverview } from './room-overview';
import { RoomTile } from './room-tile';

/**
 * Every room of the house (HAS-232, the administrator's): a card of one size per room, floor by
 * floor as on the devices page, with a line for each of the owner's rows - temperature, heating,
 * lights, blinds, motion, presence, opening sensors, the rest - and a window with the devices of
 * the room and the controls of its lights and blinds. "My room" stays the resident's page of
 * their own rooms.
 *
 * Four services feed it: the device registry (what is where), the heating (temperatures, heaters,
 * windows), the blinds and presence. Each is one call with its own freshness and failure, told
 * once in the strip of sources at the top; a room card says what is known and "not known" where
 * a service did not answer - never off, closed or away.
 */
@Component({
  selector: 'app-rooms',
  imports: [
    MatCardModule,
    MatProgressBarModule,
    TranslocoDirective,
    ApiErrorStrip,
    DataFreshness,
    RoomTile,
  ],
  templateUrl: './rooms.html',
  styleUrl: './rooms.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Rooms {
  protected readonly registry = inject(DeviceRegistryApi).watchDevices();
  protected readonly heating = inject(HeatingApi).watchRooms();
  protected readonly blinds = inject(BlindsApi).watchBlinds();
  protected readonly presence = inject(PresenceApi).watchNow();
  private readonly members = inject(ProfileStore).members;
  private readonly dialog = inject(MatDialog);

  protected readonly sources = [
    { id: 'registry', label: 'rooms.source.registry' as MessageKey, resource: this.registry },
    { id: 'heating', label: 'rooms.source.heating' as MessageKey, resource: this.heating },
    { id: 'blinds', label: 'rooms.source.blinds' as MessageKey, resource: this.blinds },
    { id: 'presence', label: 'rooms.source.presence' as MessageKey, resource: this.presence },
  ];

  /** The devices that can be shown: an entry without an id cannot be addressed by a control. */
  protected readonly devices = computed((): readonly RegisteredDevice[] | undefined => {
    const answer: unknown = this.registry.value();
    return Array.isArray(answer)
      ? (answer as unknown[]).filter(
          (entry): entry is RegisteredDevice =>
            isRecord(entry) && typeof entry['id'] === 'number' && Number.isFinite(entry['id']),
        )
      : undefined;
  });

  private readonly heatingRooms = computed(() => {
    const answer: unknown = this.heating.value();
    return Array.isArray(answer) ? toRoomViews(answer) : undefined;
  });

  /** Every room of the house, by floor - a room without a device too. */
  protected readonly floors = computed(() =>
    groupByFloor(this.devices() ?? []).map((floor) => ({
      id: floor.id,
      label: floor.label,
      rooms: floor.rooms.map((group) => this.overviewOf(group.room)),
    })),
  );

  protected openRoom(room: string, floor: MessageKey): void {
    const data: RoomDetailData = {
      // a signal: the window follows the services while it is open
      overview: computed(() => this.overviewOf(room)),
      floor,
      refreshBlinds: () => this.blinds.refresh(),
    };
    this.dialog.open(RoomDetail, { ...ROOM_DETAIL_SIZE, data, autoFocus: 'dialog' });
  }

  private overviewOf(room: string): RoomOverview {
    return toRoomOverview(
      room,
      this.devices() ?? [],
      this.heatingRooms(),
      this.blinds.value(),
      this.members(),
      this.presence.value(),
    );
  }
}
