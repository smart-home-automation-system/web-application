import { HouseholdMember } from '../../data-access/household/household-api';

export type MemberRole = 'admin' | 'resident';

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
}

/**
 * The profiles of an answer of the registry: its active members, in the order sent. Entries
 * that are not a member are skipped. Whatever is unclear is read the way that reaches the least:
 * a member is active only when the registry says `true` - not when the field is missing or is
 * anything else - and a role that is not `admin` is a resident.
 */
export function toProfiles(members: readonly HouseholdMember[]): Profile[] {
  return members.flatMap((member: unknown): Profile[] => {
    if (!isRecord(member) || member['active'] !== true) {
      return [];
    }
    const name = member['name'];
    if (typeof name !== 'string' || name.trim() === '') {
      return [];
    }
    return [{ name, role: toRole(member['role']), rooms: toRooms(member['rooms']) }];
  });
}

/** A profile kept in the browser, read back: `undefined` unless it is exactly one. */
export function parseProfile(value: unknown): Profile | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { name, role, rooms } = value;
  if (typeof name !== 'string' || name.trim() === '' || (role !== 'admin' && role !== 'resident')) {
    return undefined;
  }
  return { name, role, rooms: toRooms(rooms) };
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
    left.rooms.every((room, index) => room === right.rooms[index])
  );
}

function normalise(name: string): string {
  return name.trim().normalize('NFC').toLowerCase();
}

function toRole(value: unknown): MemberRole {
  return value === 'admin' ? 'admin' : 'resident';
}

function toRooms(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((room): room is string => typeof room === 'string' && room !== '')
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
