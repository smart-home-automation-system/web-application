import { Injectable, inject } from '@angular/core';

import { ApplianceApi } from './appliance-api';

/**
 * The appliances, polled once for the whole application (HAS-282): the notice of the shell is on
 * every page, and the card of "My room" and the tile of the overview read the same resource - two
 * pollers would ask twice and could show a finished appliance in one place and an idle one in
 * the other. It lives as long as the application, like the shell; it is created by the first
 * reader, the notice - which the shell renders for a member with a profile only.
 */
@Injectable({ providedIn: 'root' })
export class ApplianceStore {
  readonly appliances = inject(ApplianceApi).watchAppliances();
}
