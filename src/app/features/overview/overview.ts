import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { APP_CONFIG } from '../../core/config/app-config';
import { Ticker } from '../../core/time/ticker';
import { BoilerApi } from '../../data-access/boiler/boiler-api';
import { HeatingApi } from '../../data-access/heating/heating-api';
import {
  PRESENCE_CHECK_IS_LATE_AFTER_MS,
  PresenceApi,
} from '../../data-access/presence/presence-api';
import { WaterApi } from '../../data-access/water/water-api';
import { isOutOfDate, toWaterReading } from '../../data-access/water/water-reading';
import { MessageKey } from '../../i18n/messages';
import { HeatingSwitch } from '../../shared/heating-switch/heating-switch';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { toRoomViews } from '../../shared/room-heating/room-views';
import { toDeviceView } from '../boiler-room/boiler-device';
import { FLOORS } from '../heating/floors';
import { summarise, toSensorRows } from '../heating/sensor-rows';
import { OverviewTile } from './overview-tile';
import { PERSON_STATE_LABELS, lastCheck, summariseRooms, toPeople } from './overview-views';

/** The rooms that are no part of the house: a garden and a sauna are not its coldest and warmest. */
const OUTSIDE_ROOMS = FLOORS.find((floor) => floor.id === 'outside')?.rooms ?? [];

/** A device of the boiler room on its tile: its name and the word for its state. */
interface DeviceLine {
  readonly name: MessageKey;
  readonly state: MessageKey;
  readonly working: boolean | undefined;
}

/**
 * The landing page of the administrator: the house at a glance. The switch of the heating - the
 * card the heating page has, the one thing here that changes the house - and a tile per
 * dashboard with the few facts somebody looks for first, each leading to the page that has the
 * rest.
 *
 * Six calls feed the page and each has one tile, with its own freshness and its own failure:
 * the page is whole when one service is down, and says which. The tiles claim what their
 * dashboards claim and nothing more - what an answer leaves out is "not known" here too.
 */
@Component({
  selector: 'app-overview',
  imports: [
    MatIconModule,
    TranslocoDirective,
    HeatingSwitch,
    HouseAgePipe,
    LocalNumberPipe,
    OverviewTile,
  ],
  templateUrl: './overview.html',
  styleUrl: './overview.scss',
  // a row is a name and a value side by side: without the white space between them a screen
  // reader gets one word
  preserveWhitespaces: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Overview {
  private readonly zone = inject(APP_CONFIG).houseTimeZone;
  private readonly ticker = inject(Ticker);
  private readonly heatingApi = inject(HeatingApi);

  protected readonly heating = this.heatingApi.watchSwitch();
  protected readonly rooms = this.heatingApi.watchRooms();
  protected readonly sensors = this.heatingApi.watchSensors();
  protected readonly water = inject(WaterApi).watchTemperatures();
  protected readonly boiler = inject(BoilerApi).watchStatus();
  protected readonly presence = inject(PresenceApi).watchNow();

  protected readonly ONE_DECIMAL: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };
  protected readonly personState = PERSON_STATE_LABELS;

  // ---- rooms ----

  /** Whether the answer is a list at all: a 200 without a body is not "no rooms". */
  protected readonly roomsListed = computed(() => Array.isArray(this.rooms.value()));
  protected readonly roomsSummary = computed(() =>
    summariseRooms(toRoomViews(this.rooms.value()), OUTSIDE_ROOMS),
  );

  // ---- hot water ----

  private readonly waterReading = computed(() => toWaterReading(this.water.value(), this.zone));
  protected readonly tank = computed(() => this.waterReading().tank);
  protected readonly circulation = computed(() => this.waterReading().circulation);
  protected readonly measuredAt = computed(() => this.waterReading().measuredAt);
  /** The service missed two of its polls: the tile shows its last row, not the water as it is. */
  protected readonly waterOutOfDate = computed(() =>
    isOutOfDate(this.waterReading(), this.ticker.now()),
  );

  // ---- boiler room ----

  protected readonly devices = computed((): DeviceLine[] => {
    const status = this.boiler.value();
    const line = (
      name: MessageKey,
      device: ReturnType<typeof toDeviceView>,
      on: MessageKey,
      off: MessageKey,
    ): DeviceLine => ({
      name,
      working: device.working,
      state: device.working === undefined ? 'boilerRoom.noStatus' : device.working ? on : off,
    });
    return [
      line('boilerRoom.furnace', toDeviceView(status?.furnace), 'boilerRoom.on', 'boilerRoom.off'),
      line(
        'boilerRoom.hotWaterPump',
        toDeviceView(status?.pumps?.hot_water),
        'boilerRoom.running',
        'boilerRoom.stopped',
      ),
      line(
        'boilerRoom.heatingPump',
        toDeviceView(status?.pumps?.heating),
        'boilerRoom.running',
        'boilerRoom.stopped',
      ),
    ];
  });

  // ---- presence ----

  protected readonly people = computed(() => toPeople(this.presence.value(), this.zone));
  /**
   * The last check of the detection, when it is older than a detection that runs every minute
   * would leave it - the warning of the presence page: what the tile says may be hours old.
   */
  protected readonly lateCheck = computed(() => {
    const last = lastCheck(this.people());
    return last !== undefined &&
      this.ticker.now() - last.checkedAt > PRESENCE_CHECK_IS_LATE_AFTER_MS
      ? last.lastCheckedAt
      : undefined;
  });

  // ---- sensors ----

  private readonly sensorRows = computed(() => toSensorRows(this.sensors.value()));
  protected readonly sensorSummary = computed(() => summarise(this.sensorRows()));
  /** The sensors that fell silent, the ones somebody should look at first. */
  protected readonly silentSensors = computed(() =>
    this.sensorRows().filter((row) => row.stale === true),
  );
}
