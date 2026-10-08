import { Injectable, inject } from '@angular/core';

import { ApiClient } from '../../core/api/api-client';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';

/**
 * A device of the boiler room as `boiler-service` reports it. Before its first status the
 * service sends `working: false` and no message at all.
 */
export interface BoilerDeviceStatus {
  /** The relay of the device is on. (The JSON name; the Java field is `isWorking`.) */
  readonly working?: boolean;
  readonly lastMessageReply?: {
    /** What the service last noted about the device - its own words, in English. */
    readonly message?: string;
    /** House wall-clock time of that note. */
    readonly timestamp?: string;
  };
}

/**
 * `GET /home/boiler/status`: the furnace and the two pumps it feeds. The service looks at the
 * devices once a minute.
 */
export interface BoilerStatus {
  readonly furnace?: BoilerDeviceStatus;
  readonly pumps?: {
    readonly hot_water?: BoilerDeviceStatus;
    readonly heating?: BoilerDeviceStatus;
  };
}

@Injectable({ providedIn: 'root' })
export class BoilerApi {
  private readonly api = inject(ApiClient);

  /** Call in an injection context: the polling lives as long as the caller. */
  watchStatus(): PollingResource<BoilerStatus> {
    return pollingResource(() => this.api.get<BoilerStatus>('/boiler/status'), {
      intervalMs: 30_000,
    });
  }
}
