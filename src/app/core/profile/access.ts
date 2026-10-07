import { ActivatedRouteSnapshot } from '@angular/router';

import { Profile } from './profile';

/**
 * Who may open a page - `data.access` of its route, and of its navigation entry:
 * - `anyone` - with or without a profile: the personal link, the error page;
 * - `chooser` - the profile picker: open while nobody is chosen, and to an administrator, who
 *   may look at the application as somebody else; a resident is not offered other profiles;
 * - `member` - every member of the household;
 * - `admin` - the administrator alone. **The default**: a page that does not say otherwise is
 *   closed to residents, so a new feature cannot be opened to them by forgetting a line.
 */
export type Access = 'anyone' | 'chooser' | 'member' | 'admin';

/** Where the application sends somebody who has no profile. */
export const PROFILES_PATH = '/profiles';
/** The page of a resident: everything they may not open leads here. */
export const RESIDENT_HOME_PATH = '/room';

/**
 * The one rule of who reaches what. Answers where somebody with this profile is sent instead of
 * a page of this access, or `undefined` when they may open it.
 *
 * This is navigation, not access control: it decides what the interface offers. The backend
 * answers every caller alike until the gateway validates tokens (phase 2).
 */
export function redirectFor(access: Access, profile: Profile | undefined): string | undefined {
  if (access === 'anyone') {
    return undefined;
  }
  if (profile === undefined) {
    return access === 'chooser' ? undefined : PROFILES_PATH;
  }
  if (profile.role === 'admin' || access === 'member') {
    return undefined;
  }
  return RESIDENT_HOME_PATH;
}

/** The access of the page a route leads to - of its innermost route. */
export function accessOf(route: ActivatedRouteSnapshot): Access {
  let page = route;
  while (page.firstChild) {
    page = page.firstChild;
  }
  return isAccess(page.data['access']) ? page.data['access'] : 'admin';
}

function isAccess(value: unknown): value is Access {
  return value === 'anyone' || value === 'chooser' || value === 'member' || value === 'admin';
}
