import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';

/**
 * `GET /home/household` - one member of the household registry (`database-service`). The
 * registry also sends the member's phone number and Wi-Fi devices; the application reads neither.
 *
 * Nothing checks an answer at runtime, so every field but the name is optional here and the
 * role is plain text: whoever reads it decides what an unknown value means.
 */
export interface HouseholdMember {
  readonly name: string;
  /** A deactivated member stays in the registry with `false`; only `true` counts as active. */
  readonly active?: boolean;
  /** `admin` or `resident`. */
  readonly role?: string;
  /** Identifiers of the member's rooms, in display order; left out when there are none. */
  readonly rooms?: readonly string[];
}

@Injectable({ providedIn: 'root' })
export class HouseholdApi {
  private readonly api = inject(ApiClient);

  /** Every member of the registry, the deactivated ones included. */
  members(): Observable<HouseholdMember[]> {
    return this.api.get<HouseholdMember[]>('/household');
  }
}
