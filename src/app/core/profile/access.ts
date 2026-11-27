import { ActivatedRouteSnapshot } from '@angular/router';

import { MemberPermission, Profile, hasPermission } from './profile';

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
 * A page may also ask for a permission of the registry (`data.permission` of its route,
 * `permission` of its navigation entry - HAS-438: the heating of the whole house): then only a
 * member granted it opens the page, whatever the role - the administrator too is sent to their
 * room without it, as on the page the permission was first given for.
 *
 * A page of the administrator may also be **opened** by a permission (`data.openedBy` of its route, `openedBy` of its
 * navigation entry - HAS-517: the media page): the administrator always opens it, and a member granted the permission
 * opens it too - and sees there only what the permission is for.
 *
 * This is navigation, not access control: it decides what the interface offers. The backend
 * answers every caller alike (owner, 2026-11-27: it never blocks by a role or a permission).
 */
export function redirectFor(
  access: Access,
  profile: Profile | undefined,
  permission?: MemberPermission,
  openedBy?: MemberPermission,
): string | undefined {
  if (access === 'anyone') {
    return undefined;
  }
  if (profile === undefined) {
    return access === 'chooser' ? undefined : PROFILES_PATH;
  }
  if (permission !== undefined && !hasPermission(profile, permission)) {
    return RESIDENT_HOME_PATH;
  }
  if (openedBy !== undefined && hasPermission(profile, openedBy)) {
    return undefined;
  }
  if (profile.role === 'admin' || access === 'member') {
    return undefined;
  }
  return RESIDENT_HOME_PATH;
}

/** The access of the page a route leads to - of its innermost route. */
export function accessOf(route: ActivatedRouteSnapshot): Access {
  const access = pageOf(route).data['access'];
  return isAccess(access) ? access : 'admin';
}

/** The permission the page a route leads to asks for, if any - of its innermost route. */
export function permissionOf(route: ActivatedRouteSnapshot): MemberPermission | undefined {
  return memberPermission(pageOf(route).data['permission']);
}

/** The permission that opens the page of the administrator a route leads to to a member, if any (HAS-517). */
export function openedByOf(route: ActivatedRouteSnapshot): MemberPermission | undefined {
  return memberPermission(pageOf(route).data['openedBy']);
}

function memberPermission(value: unknown): MemberPermission | undefined {
  return value === 'heating_switch' || value === 'amplifier_unlock' ? value : undefined;
}

function pageOf(route: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
  let page = route;
  while (page.firstChild) {
    page = page.firstChild;
  }
  return page;
}

function isAccess(value: unknown): value is Access {
  return value === 'anyone' || value === 'chooser' || value === 'member' || value === 'admin';
}
