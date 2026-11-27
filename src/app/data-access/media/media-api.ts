import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';

/**
 * The audio and video equipment of `media-service` (epic HAS-508, the service >= 0.2.0 behind the gateway >= 0.14.0):
 * today the unlock of the amplifier that hangs after every loss of the grid. Nothing here is read - the amplifier has
 * no state the service could ask for (HAS-515), so there is no `watch` and nothing to read back.
 */
@Injectable({ providedIn: 'root' })
export class MediaApi {
  private readonly api = inject(ApiClient);

  /**
   * `POST /media/amplifier/unlock?source=dashboard&member=`: the service sends the amplifier the file of its firmware
   * form that unhangs it, once. 202 once the amplifier took it - it should work again; the service refuses a member
   * without `amplifier_unlock` and a second unlock while one is on its way. Sent once: never repeated by the caller.
   */
  unlockAmplifier(member: string): Observable<void> {
    return this.api
      .post<unknown>('/media/amplifier/unlock', undefined, { source: 'dashboard', member })
      .pipe(map(() => undefined));
  }
}
