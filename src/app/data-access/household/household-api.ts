import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient } from '../../core/api/api-client';

/**
 * `GET /home/household/profiles` - a household member as the dashboard may know them
 * (`database-service`, `HouseholdProfile` of `smart-home-sdk`): the name, the role, the rooms
 * and the permissions, and nothing else of the registry. Only active members are in the answer.
 *
 * Nothing checks an answer at runtime, so the role is plain text here - whoever reads it
 * decides what an unknown value means.
 */
export interface HouseholdProfile {
  readonly name: string;
  /** `admin` or `resident`. */
  readonly role?: string;
  /** Identifiers of the member's rooms, in display order; left out when there are none. */
  readonly rooms?: readonly string[];
  /**
   * What the member may do beyond their role (`heating_switch`); left out when nothing was
   * granted, and by a registry older than `database-service` 0.11.0 always.
   */
  readonly permissions?: readonly string[];
}

@Injectable({ providedIn: 'root' })
export class HouseholdApi {
  private readonly api = inject(ApiClient);

  /**
   * The profiles of the active members. Deliberately not the registry itself
   * (`GET /home/household`), which carries the phone number and the devices of everybody: this
   * call is made by every browser in the house, at every start.
   */
  profiles(): Observable<HouseholdProfile[]> {
    return this.api.get<HouseholdProfile[]>('/household/profiles');
  }
}
