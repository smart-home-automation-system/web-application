import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { APP_CONFIG } from '../../core/config/app-config';
import { Ticker } from '../../core/time/ticker';
import { ApplianceStore } from '../../data-access/appliance/appliance-store';
import { BlindsApi } from '../../data-access/blinds/blinds-api';
import { BoilerApi } from '../../data-access/boiler/boiler-api';
import { HeatingApi } from '../../data-access/heating/heating-api';
import {
  PRESENCE_CHECK_IS_LATE_AFTER_MS,
  PresenceApi,
} from '../../data-access/presence/presence-api';
import { WaterApi } from '../../data-access/water/water-api';
import { isOutOfDate, toWaterReading } from '../../data-access/water/water-reading';
import { CurrentWeatherStore } from '../../data-access/weather/current-weather-store';
import { newestOf, toWeatherReading } from '../../data-access/weather/weather-reading';
import { MessageKey } from '../../i18n/messages';
import { ApiErrorStrip } from '../../shared/api-error/api-error-strip';
import { HouseDateTimePipe } from '../../shared/house-date-time/house-date-time.pipe';
import { HouseAgePipe } from '../../shared/house-age/house-age.pipe';
import { LocalNumberPipe } from '../../shared/local-number/local-number.pipe';
import { toRoomViews } from '../../shared/room-heating/room-views';
import { toDeviceView } from '../boiler-room/boiler-device';
import { FLOORS } from '../../shared/floors/floors';
import { summarise, toSensorRows } from '../heating/sensor-rows';
import { DomainTile } from '../../shared/domain-tile/domain-tile';
import { blindsOf } from '../../shared/blinds/addressed-blind';
import { summariseAppliances, toApplianceViews } from '../../shared/appliances/appliance-views';
import { LightApi } from '../../data-access/light/light-api';
import { stateOf } from '../../shared/lights/light-labels';
import { countStates, lightRoomsOf } from '../lights/light-rooms';
import {
  PERSON_STATE_LABELS,
  lastCheck,
  summariseBlinds,
  summariseRooms,
  toPeople,
} from './overview-views';

/** The rooms that are no part of the house: a garden and a sauna are not its coldest and warmest. */
const OUTSIDE_ROOMS = FLOORS.find((floor) => floor.id === 'outside')?.rooms ?? [];

/** A device of the boiler room on its tile: its name and the word for its state. */
interface DeviceLine {
  readonly name: MessageKey;
  readonly state: MessageKey;
  readonly working: boolean | undefined;
}

/**
 * The landing page of the administrator: the house at a glance - a tile per dashboard with the few
 * facts somebody looks for first, each leading to the page that has the rest. Nothing here changes
 * the house: the switch of the heating is on the heating page only (owner, 2026-10-21, HAS-266).
 *
 * Eleven calls feed the page (the appliances since HAS-282), each with its own failure: the page
 * is whole when one service is down, and says which. Every tile is one call - but the heating tile, which tells the state of
 * the system, its rooms and its silent sensors (three calls, owner's choice of HAS-266): it tells
 * the freshness of the state and the failure of each of the three. The tiles claim what their
 * dashboards claim and nothing more - what an answer leaves out is "not known" here too.
 */
@Component({
  selector: 'app-overview',
  imports: [
    MatIconModule,
    TranslocoDirective,
    ApiErrorStrip,
    HouseDateTimePipe,
    HouseAgePipe,
    LocalNumberPipe,
    DomainTile,
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

  // the state of the system only: the switch is on the heating page (owner, 2026-10-21, HAS-266)
  protected readonly heating = this.heatingApi.watchStatus();
  protected readonly rooms = this.heatingApi.watchRooms();
  protected readonly sensors = this.heatingApi.watchSensors();
  protected readonly water = inject(WaterApi).watchTemperatures();
  protected readonly boiler = inject(BoilerApi).watchStatus();
  protected readonly presence = inject(PresenceApi).watchNow();
  // the resource of the strip in the panel: one poller, so the two never tell different answers
  protected readonly weather = inject(CurrentWeatherStore).current;
  // counts only: once a minute, not at the pace of the blinds page
  protected readonly blinds = inject(BlindsApi).watchBlinds(60_000);
  // HAS-268: the lights of the house counted, and the empty house - two calls, each told
  private readonly lightApi = inject(LightApi);
  protected readonly lights = this.lightApi.watchLights(60_000);
  protected readonly emptyHouse = this.lightApi.watchEmptyHouse();
  // HAS-282: the resource of the notice of the shell - one poller, so the two never disagree
  protected readonly appliances = inject(ApplianceStore).appliances;

  protected readonly ONE_DECIMAL: Intl.NumberFormatOptions = {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  };
  protected readonly WHOLE: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };
  protected readonly personState = PERSON_STATE_LABELS;

  // ---- heating ----

  /** True, false, or `undefined` while the answer does not say. */
  protected readonly heatingEnabled = computed(() => {
    const enabled: unknown = this.heating.value()?.isHeatingEnabled;
    return typeof enabled === 'boolean' ? enabled : undefined;
  });

  /** When the system was last switched, house wall-clock time. */
  protected readonly heatingSince = computed(() => {
    const updatedAt: unknown = this.heating.value()?.updatedAt;
    return typeof updatedAt === 'string' ? updatedAt : undefined;
  });

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

  // ---- blinds (HAS-254) ----

  protected readonly blindsSummary = computed(() => summariseBlinds(blindsOf(this.blinds.value())));

  // ---- lights ----

  /** The lights counted by state and the rooms with one on; `undefined` while not answered. */
  protected readonly lightsSummary = computed(() => {
    const rooms = lightRoomsOf(this.lights.value());
    if (rooms === undefined) {
      return undefined;
    }
    const counts = countStates(rooms);
    return {
      ...counts,
      total: counts.on + counts.off + counts.unknown,
      // the rooms with a light on, by their identifiers as the service orders them - joined here,
      // so the template prints no space before a comma
      litRooms: rooms
        .filter((room) => room.lights.some((light) => stateOf(light) === 'on'))
        .map((room) => room.room)
        .join(', '),
    };
  });

  // ---- appliances (HAS-282) ----

  /** What runs and what waits, the names joined here; `undefined` while the answer is no list. */
  protected readonly appliancesSummary = computed(() => {
    const answer = this.appliances.value();
    if (!Array.isArray(answer)) {
      return undefined;
    }
    const views = toApplianceViews(answer);
    const summary = summariseAppliances(views);
    return {
      total: views.length,
      running: summary.running.join(', '),
      waiting: summary.waiting.join(', '),
      unknown: summary.unknown,
    };
  });

  /** `empty`, `occupied` or `unknown` - what the service says; anything else is unknown. */
  protected readonly houseState = computed((): 'empty' | 'occupied' | 'unknown' => {
    const house = this.emptyHouse.value()?.house;
    return house === 'empty' || house === 'occupied' ? house : 'unknown';
  });
  protected readonly HOUSE_LABELS: Readonly<Record<'empty' | 'occupied' | 'unknown', MessageKey>> =
    {
      empty: 'overview.lights.houseEmpty',
      occupied: 'overview.lights.houseOccupied',
      unknown: 'overview.lights.houseUnknown',
    };

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

  // ---- weather ----

  /** The reading the strip of the panel shows too, read with the same function. */
  protected readonly weatherReading = computed(() =>
    toWeatherReading(this.weather.value(), this.zone),
  );
  /** The metrics of the tile: whatever of them the answer has. */
  private readonly weatherMetrics = computed(() => {
    const { temperature, dewPoint, wind, gust, raining, illuminance } = this.weatherReading();
    return [temperature, dewPoint, wind, gust, raining, illuminance];
  });
  protected readonly weatherShown = computed(() =>
    this.weatherMetrics().some((metric) => metric !== undefined),
  );
  /** The last the station was heard of what the tile shows, and whether all of it is stale. */
  protected readonly weatherNewest = computed(() => newestOf(this.weatherMetrics()));

  // ---- sensors ----

  private readonly sensorRows = computed(() => toSensorRows(this.sensors.value()));
  /** For the red light of the heating tile; its words are put in the template, which follows a
   * language whose texts arrive later (review of HAS-266). */
  protected readonly sensorSummary = computed(() => summarise(this.sensorRows()));
}
