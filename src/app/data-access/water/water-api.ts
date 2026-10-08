import { Injectable, inject } from '@angular/core';

import { ApiClient } from '../../core/api/api-client';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';

/**
 * `GET /home/water/status/temperature` (`water-service`): the last reading of the two sensors.
 * The service reads them every three minutes and answers with the stored row - the answer says
 * nothing about *when* that was, so a reading cannot be told from a stale one here.
 */
export interface WaterTemperatures {
  /** The water in the tank. */
  readonly water?: { readonly temperature?: number };
  readonly circulation?: {
    readonly temperature?: number;
    /** Always false so far: the backend does not fill it in. Not shown anywhere. */
    readonly pumpActive?: boolean;
  };
}

/** `GET /home/water/status/active`: whether the water asks to be heated. */
export interface WaterHeatingDemand {
  readonly active?: boolean;
}

/**
 * Between which temperatures the water is kept: heating is asked for when the tank drops below
 * `low` and until it is above `high`. **A copy of two constants of `water-service`**
 * (`WaterService.updateWaterHeatingStatus`), which no endpoint exposes - change them there and
 * the gauge here draws the old band until this is changed too.
 */
export const HOT_WATER_BAND = { low: 38, high: 42 } as const;

const POLL_EVERY_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class WaterApi {
  private readonly api = inject(ApiClient);

  /**
   * The temperatures; `null` while the service has no reading yet - it then answers 200 with an
   * empty body. Call in an injection context: the polling lives as long as the caller.
   */
  watchTemperatures(): PollingResource<WaterTemperatures | null> {
    return pollingResource(
      () => this.api.get<WaterTemperatures | null>('/water/status/temperature'),
      { intervalMs: POLL_EVERY_MS },
    );
  }

  /** Call in an injection context: the polling lives as long as the caller. */
  watchHeatingDemand(): PollingResource<WaterHeatingDemand> {
    return pollingResource(() => this.api.get<WaterHeatingDemand>('/water/status/active'), {
      intervalMs: POLL_EVERY_MS,
    });
  }
}
