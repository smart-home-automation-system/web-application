import { Injectable, inject } from '@angular/core';

import { ApiClient } from '../../core/api/api-client';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';

/** `GET /home/heating` - the switch of the whole heating system. */
export interface HeatingStatus {
  readonly isHeatingEnabled: boolean;
  /** House wall-clock time of the last change of the switch. */
  readonly updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class HeatingApi {
  private readonly api = inject(ApiClient);

  /** Call in an injection context: the polling lives as long as the caller. */
  watchStatus(): PollingResource<HeatingStatus> {
    return pollingResource(() => this.api.get<HeatingStatus>('/heating'), { intervalMs: 30_000 });
  }
}
