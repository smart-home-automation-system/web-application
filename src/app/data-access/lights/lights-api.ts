import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';

/**
 * The Eaton lights, switched through `amx-service` (`POST /home/amx/lights/{point}`, by the point
 * of the registry). The answer, 202, says the frame went to the gateway - not that the light is
 * on: **no service keeps the state of a light yet** (it will be light-service's), so nothing is
 * read back and the room view never shows a light as on or off.
 */
@Injectable({ providedIn: 'root' })
export class LightsApi {
  private readonly api = inject(ApiClient);

  switch(point: number, on: boolean): Observable<void> {
    return this.api
      .post<unknown>(`/amx/lights/${point}`, undefined, { turn: on ? 'on' : 'off' })
      .pipe(map(() => undefined));
  }

  /** A dimmer only: 0 ... 100. */
  setLevel(point: number, level: number): Observable<void> {
    return this.api
      .post<unknown>(`/amx/lights/${point}/level`, undefined, { value: level })
      .pipe(map(() => undefined));
  }
}
