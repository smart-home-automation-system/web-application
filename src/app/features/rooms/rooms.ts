import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoDirective } from '@jsverse/transloco';

import { isRecord } from '../../core/util/is-record';
import { BlindsApi } from '../../data-access/blinds/blinds-api';
import { DeviceRegistryApi, RegisteredDevice } from '../../data-access/devices/device-registry-api';
import { HeatingApi } from '../../data-access/heating/heating-api';
import { LightApi } from '../../data-access/light/light-api';
import { MessageKey } from '../../i18n/messages';
import { SourcesStrip } from '../../shared/sources-strip/sources-strip';
import { toRoomViews } from '../../shared/room-heating/room-views';
import { groupByFloor } from '../devices/device-groups';
import { ROOM_DETAIL_SIZE, RoomDetail, RoomDetailData } from './room-detail';
import { RoomOverview, toRoomOverview } from './room-overview';
import { RoomTile } from './room-tile';

/**
 * When the lights are read once more after a command (HAS-293): an Eaton light reports its new
 * state through `amx-service` about a second after `light-service` took the command, so the read
 * right after it still answers the state before. A Shelly light has reported by then.
 */
export const LIGHTS_READ_AGAIN_AFTER_MS = 2_500;

/**
 * Every room of the house (HAS-232, the administrator's): a card of one size per room, floor by
 * floor as on the devices page, with a line for each of the owner's rows - temperature, heating,
 * lights, blinds, motion, presence, opening sensors, the rest - and a window with the devices of
 * the room and the controls of its lights and blinds. "My room" stays the resident's page of
 * their own rooms.
 *
 * Four services feed it: the device registry (what is where), the heating (temperatures, heaters,
 * windows), the blinds and the lights (HAS-292, `light-service` - the real state of every light). Each is one call with its own freshness and failure, told
 * once in the strip of sources at the top; a room card says what is known and "not known" where
 * a service did not answer - never off, closed or away.
 */
@Component({
  selector: 'app-rooms',
  imports: [TranslocoDirective, RoomTile, SourcesStrip],
  templateUrl: './rooms.html',
  styleUrl: './rooms.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Rooms {
  protected readonly registry = inject(DeviceRegistryApi).watchDevices();
  protected readonly heating = inject(HeatingApi).watchRooms();
  protected readonly blinds = inject(BlindsApi).watchBlinds();
  protected readonly lights = inject(LightApi).watchLights();
  private readonly dialog = inject(MatDialog);
  // the second reads of the lights still to come; a page that is gone makes none
  private readonly readsToCome = new Set<ReturnType<typeof setTimeout>>();

  protected readonly sources = [
    { id: 'registry', label: 'rooms.source.registry' as MessageKey, resource: this.registry },
    { id: 'heating', label: 'rooms.source.heating' as MessageKey, resource: this.heating },
    { id: 'blinds', label: 'rooms.source.blinds' as MessageKey, resource: this.blinds },
    { id: 'lights', label: 'rooms.source.lights' as MessageKey, resource: this.lights },
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

  constructor() {
    inject(DestroyRef).onDestroy(() => this.readsToCome.forEach((read) => clearTimeout(read)));
  }

  protected openRoom(room: string, floor: MessageKey): void {
    const data: RoomDetailData = {
      // a signal: the window follows the services while it is open
      overview: computed(() => this.overviewOf(room)),
      floor,
      refreshBlinds: () => this.blinds.refresh(),
      refreshLights: () => this.readLightsAfterCommand(),
    };
    this.dialog.open(RoomDetail, { ...ROOM_DETAIL_SIZE, data, autoFocus: 'dialog' });
  }

  /**
   * Reads the lights at once - the command of the light is over with that answer, and its buttons
   * free - and once more a moment later, for an Eaton light that reports late. Neither moves
   * anything on screen by itself: only what `light-service` answers does.
   */
  private readLightsAfterCommand(): Promise<void> {
    const read = setTimeout(() => {
      this.readsToCome.delete(read);
      void this.lights.refresh();
    }, LIGHTS_READ_AGAIN_AFTER_MS);
    this.readsToCome.add(read);
    return this.lights.refresh();
  }

  private overviewOf(room: string): RoomOverview {
    return toRoomOverview(
      room,
      this.devices() ?? [],
      this.heatingRooms(),
      this.blinds.value(),
      this.lights.value(),
    );
  }
}
