import { isRecord } from '../util/is-record';

export type MemberRole = 'admin' | 'resident';

/**
 * Something the registry lets one member do beyond what their role gives them
 * (`MemberPermission` of `smart-home-sdk`). `heating_switch`: the switch of the heating of the
 * whole house on their own page.
 */
export type MemberPermission = 'heating_switch';

/**
 * Who is using the application in this browser: a member of the household, with the role and
 * the rooms the registry gives them. This is all a feature may know about the person - where it
 * comes from (a name in a link today, a token later) is the business of `ProfileStore`.
 */
export interface Profile {
  readonly name: string;
  readonly role: MemberRole;
  /** Identifiers of the member's rooms, in display order; empty when none is assigned. */
  readonly rooms: readonly string[];
  /**
   * What the registry granted this member beyond their role, as it names it; absent when
   * nothing was. Ask with `hasPermission` - a value this version does not know is carried
   * along and opens nothing.
   */
  readonly permissions?: readonly string[];
}

/**
 * Whether the registry granted the member the permission. Like a role it decides what the
 * interface offers and nothing more: a missing profile, a missing list and a list without the
 * permission all answer no.
 */
export function hasPermission(profile: Profile | undefined, permission: MemberPermission): boolean {
  return profile?.permissions?.includes(permission) === true;
}

/**
 * The profiles of an answer of the registry, in the order sent - it answers with its active
 * members only, so everybody in it has a profile. Nothing checks an answer at runtime: entries
 * that are not a profile are skipped, and a role that is not `admin` - missing, or one this
 * version does not know - is a resident, the role that reaches the least.
 *
 * The answer carries no `active`, and none is expected. Should one ever arrive as `false` -
 * the full registry answering under this address, a field added later - that member gets no
 * profile: the one way this could be wrong is the way that must not open anything.
 */
export function toProfiles(members: readonly unknown[]): Profile[] {
  return members.flatMap((member): Profile[] => {
    if (!isRecord(member) || member['active'] === false) {
      return [];
    }
    const name = member['name'];
    if (typeof name !== 'string' || name.trim() === '') {
      return [];
    }
    return [
      {
        name,
        role: toRole(member['role']),
        rooms: toRooms(member['rooms']),
        ...toPermissions(member['permissions']),
      },
    ];
  });
}

/** A profile kept in the browser, read back: `undefined` unless it is exactly one. */
export function parseProfile(value: unknown): Profile | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { name, role, rooms, permissions } = value;
  if (typeof name !== 'string' || name.trim() === '' || (role !== 'admin' && role !== 'resident')) {
    return undefined;
  }
  return { name, role, rooms: toRooms(rooms), ...toPermissions(permissions) };
}

/**
 * A link is typed by hand as often as it is tapped: the name in it matches whatever its case.
 * Folded without regard to the language of the browser - a Turkish one lowers "I" to a dotless
 * "ı", and the same link has to open the same profile on every device.
 */
export function sameName(left: string, right: string): boolean {
  return normalise(left) === normalise(right);
}

export function sameProfile(left: Profile | undefined, right: Profile | undefined): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return (
    left.name === right.name &&
    left.role === right.role &&
    left.rooms.length === right.rooms.length &&
    left.rooms.every((room, index) => room === right.rooms[index]) &&
    // what was granted, whatever the order it is listed in: a grant or a withdrawal in the
    // registry has to replace the profile this browser remembers
    samePermissions(left.permissions ?? [], right.permissions ?? [])
  );
}

function samePermissions(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((permission) => right.includes(permission));
}

function normalise(name: string): string {
  return name.trim().normalize('NFC').toLowerCase();
}

function toRole(value: unknown): MemberRole {
  return value === 'admin' ? 'admin' : 'resident';
}

/** The permissions as a field of a profile - or no field at all when nothing was granted. */
function toPermissions(value: unknown): { permissions?: string[] } {
  const granted = Array.isArray(value)
    ? [...new Set(value.filter((one): one is string => typeof one === 'string' && one !== ''))]
    : [];
  return granted.length > 0 ? { permissions: granted } : {};
}

function toRooms(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((room): room is string => typeof room === 'string' && room !== '')
    : [];
}
