import {
  HouseholdMember,
  HouseholdProfile,
  MemberDevice,
} from '../app/data-access/household/household-api';
import {
  MEMBER_PERMISSIONS,
  MEMBER_ROLES,
  ROOM_NAMES,
} from '../app/data-access/household/registry-values';
import { isRecord } from '../app/core/util/is-record';
import type { MockReply } from './handlers';

/**
 * The household registry of the mock house (`database-service`), which can be changed: every
 * write of the administration page changes what the next reads answer, in the memory of the
 * page - a reload is the household as it started. It refuses what the real registry refuses,
 * with the same status and the same `code`.
 *
 * Invented people, phone numbers and devices; the room identifiers are the public ones of
 * `smart-home-sdk`. Emil is switched off: the registry lists him, the profiles do not.
 */
interface StoredMember {
  name: string;
  phone: string;
  active: boolean;
  role: string;
  rooms: string[];
  permissions: string[];
  devices: { name: string; mac: string }[];
}

const AT_THE_START: readonly StoredMember[] = [
  {
    name: 'Aurelia',
    phone: '+48500100101',
    active: true,
    role: 'admin',
    rooms: ['office', 'living room'],
    permissions: [],
    devices: [
      { name: 'Phone', mac: '02:00:00:00:a1:01' },
      { name: 'Watch', mac: '02:00:00:00:a1:02' },
    ],
  },
  {
    name: 'Borys',
    phone: '+48500100102',
    active: true,
    role: 'resident',
    rooms: ['loft'],
    permissions: [],
    devices: [{ name: 'Phone', mac: '02:00:00:00:b0:01' }],
  },
  {
    // the one member the registry lets switch the heating of the whole house from their own page
    name: 'Celina',
    phone: '+48500100103',
    active: true,
    role: 'resident',
    rooms: ['bedroom', 'wardrobe'],
    permissions: ['heating_switch'],
    devices: [{ name: 'Phone', mac: '02:00:00:00:c3:01' }],
  },
  {
    name: 'Damian',
    phone: '+48500100104',
    active: true,
    role: 'resident',
    rooms: [],
    permissions: [],
    devices: [],
  },
  {
    name: 'Emil',
    phone: '+48500100105',
    active: false,
    role: 'resident',
    rooms: ['garage'],
    permissions: [],
    devices: [{ name: 'Phone', mac: '02:00:00:00:e5:01' }],
  },
];

let members: StoredMember[] = structuredClone([...AT_THE_START]);

/** The household as it started - for a unit test that changed it. */
export function resetHousehold(): void {
  members = structuredClone([...AT_THE_START]);
}

/** `GET /home/household`: everybody, sorted by name, `rooms` and `permissions` left out when empty. */
export function householdRegistry(): HouseholdMember[] {
  return [...members].sort(byName).map(toMember);
}

/** `GET /home/household/profiles`: the active members, without phone and devices. */
export function householdProfiles(): HouseholdProfile[] {
  return householdRegistry()
    .filter((member) => member.active)
    .map(({ name, role, rooms, permissions }) => ({
      name,
      role,
      ...(rooms ? { rooms } : {}),
      ...(permissions ? { permissions } : {}),
    }));
}

export function addMember(body: unknown): MockReply {
  const details = memberOf(body);
  if (details === undefined) {
    return malformed();
  }
  const rooms = listOf(isRecord(body) ? body['rooms'] : undefined, ROOM_NAMES, 'Room');
  const permissions = listOf(
    isRecord(body) ? body['permissions'] : undefined,
    MEMBER_PERMISSIONS,
    'Permission',
  );
  if (!Array.isArray(rooms)) {
    return rooms;
  }
  if (!Array.isArray(permissions)) {
    return permissions;
  }
  const clash = clashOf(details, undefined);
  if (clash) {
    return clash;
  }
  const added: StoredMember = {
    ...details,
    role: details.role ?? 'resident',
    active: true,
    rooms,
    permissions,
    // a new member has no devices yet - the ones in the payload are ignored
    devices: [],
  };
  members.push(added);
  return { status: 201, body: toMember(added) };
}

/** `PATCH`: the name, the phone and - only when the body names one - the role. */
export function updateMember(name: string, body: unknown): MockReply {
  const member = find(name);
  const details = memberOf(body);
  if (details === undefined) {
    return malformed();
  }
  if (member === undefined) {
    return noSuchMember(name);
  }
  const clash = clashOf(details, member);
  if (clash) {
    return clash;
  }
  member.name = details.name;
  member.phone = details.phone;
  member.role = details.role ?? member.role;
  return { status: 200, body: toMember(member) };
}

export function replaceRooms(name: string, body: unknown): MockReply {
  const rooms = listOf(body, ROOM_NAMES, 'Room');
  if (!Array.isArray(rooms)) {
    return rooms;
  }
  const member = find(name);
  if (member === undefined) {
    return noSuchMember(name);
  }
  member.rooms = rooms;
  return { status: 200, body: toMember(member) };
}

export function replacePermissions(name: string, body: unknown): MockReply {
  const permissions = listOf(body, MEMBER_PERMISSIONS, 'Permission');
  if (!Array.isArray(permissions)) {
    return permissions;
  }
  const member = find(name);
  if (member === undefined) {
    return noSuchMember(name);
  }
  member.permissions = permissions;
  return { status: 200, body: toMember(member) };
}

export function setMemberActive(name: string, active: boolean): MockReply {
  const member = find(name);
  if (member === undefined) {
    return noSuchMember(name);
  }
  member.active = active;
  return { status: 200, body: toMember(member) };
}

export function removeMember(name: string): MockReply {
  const member = find(name);
  if (member === undefined) {
    return noSuchMember(name);
  }
  members = members.filter((one) => one !== member);
  return { status: 204, body: null };
}

export function addDevice(name: string, body: unknown): MockReply {
  const device = deviceOf(body);
  if (device === undefined) {
    return malformed();
  }
  const member = find(name);
  if (member === undefined) {
    return noSuchMember(name);
  }
  const clash = deviceClashOf(member, device, undefined);
  if (clash) {
    return clash;
  }
  member.devices.push(device);
  return { status: 201, body: device };
}

export function updateDevice(name: string, mac: string | null, body: unknown): MockReply {
  const device = deviceOf(body);
  if (device === undefined || mac === null) {
    return malformed();
  }
  const member = find(name);
  if (member === undefined) {
    return noSuchMember(name);
  }
  const existing = member.devices.find((one) => one.mac === mac.toLowerCase());
  if (existing === undefined) {
    return noSuchDevice(name, mac);
  }
  const clash = deviceClashOf(member, device, existing);
  if (clash) {
    return clash;
  }
  existing.name = device.name;
  existing.mac = device.mac;
  return { status: 200, body: { ...existing } };
}

export function removeDevice(name: string, mac: string | null): MockReply {
  if (mac === null) {
    return malformed();
  }
  const member = find(name);
  if (member === undefined) {
    return noSuchMember(name);
  }
  const existing = member.devices.find((one) => one.mac === mac.toLowerCase());
  if (existing === undefined) {
    return noSuchDevice(name, mac);
  }
  member.devices = member.devices.filter((one) => one !== existing);
  return { status: 204, body: null };
}

// ---- what the registry checks ----

const PHONE = /^\+[1-9][0-9]{7,14}$/;
const MAC = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/;

function memberOf(body: unknown): { name: string; phone: string; role?: string } | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  const { name, phone, role } = body;
  if (typeof name !== 'string' || name.length < 3 || name.length > 50) {
    return undefined;
  }
  if (typeof phone !== 'string' || !PHONE.test(phone)) {
    return undefined;
  }
  if (role === undefined || role === null) {
    return { name, phone };
  }
  return typeof role === 'string' && (MEMBER_ROLES as readonly string[]).includes(role)
    ? { name, phone, role }
    : undefined;
}

function deviceOf(body: unknown): { name: string; mac: string } | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  const { name, mac } = body;
  return typeof name === 'string' && name.length <= 50 && typeof mac === 'string' && MAC.test(mac)
    ? { name, mac }
    : undefined;
}

/** A list of rooms or permissions as the registry stores it - or the refusal it answers with. */
function listOf(body: unknown, known: readonly string[], what: string): string[] | MockReply {
  if (body === undefined) {
    return [];
  }
  if (!Array.isArray(body)) {
    return malformed();
  }
  const list: string[] = [];
  for (const value of body as unknown[]) {
    if (value === null) {
      return refusal(400, 'INVALID_HOUSEHOLD_MEMBER', `A ${what.toLowerCase()} must not be null`);
    }
    if (typeof value !== 'string' || !known.includes(value)) {
      return malformed();
    }
    if (list.includes(value)) {
      return refusal(
        400,
        'INVALID_HOUSEHOLD_MEMBER',
        `${what} [${value}] is listed more than once`,
      );
    }
    list.push(value);
  }
  return list;
}

function clashOf(
  details: { name: string; phone: string },
  self: StoredMember | undefined,
): MockReply | undefined {
  const others = members.filter((one) => one !== self);
  if (others.some((one) => one.name.toLowerCase() === details.name.toLowerCase())) {
    return refusal(
      409,
      'HOUSEHOLD_CONFLICT',
      `Household member named [${details.name}] already exists`,
    );
  }
  if (others.some((one) => one.phone === details.phone)) {
    return refusal(
      409,
      'HOUSEHOLD_CONFLICT',
      `Phone number [${details.phone}] is already assigned to another household member`,
    );
  }
  return undefined;
}

function deviceClashOf(
  member: StoredMember,
  device: { name: string; mac: string },
  self: { name: string; mac: string } | undefined,
): MockReply | undefined {
  const everywhere = members.flatMap((one) => one.devices).filter((one) => one !== self);
  if (everywhere.some((one) => one.mac === device.mac)) {
    return refusal(409, 'DEVICE_EXIST', `Device with MAC [${device.mac}] is already registered`);
  }
  if (member.devices.some((one) => one !== self && one.name === device.name)) {
    return refusal(
      409,
      'DEVICE_EXIST',
      `Household member [${member.name}] already has a device named [${device.name}]`,
    );
  }
  return undefined;
}

function find(name: string): StoredMember | undefined {
  return members.find((one) => one.name.toLowerCase() === name.toLowerCase());
}

function toMember(member: StoredMember): HouseholdMember {
  const devices: MemberDevice[] = [...member.devices]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((device) => ({ ...device }));
  return {
    name: member.name,
    phone: member.phone,
    devices,
    active: member.active,
    role: member.role,
    ...(member.rooms.length > 0 ? { rooms: [...member.rooms] } : {}),
    ...(member.permissions.length > 0 ? { permissions: [...member.permissions] } : {}),
  };
}

function byName(left: StoredMember, right: StoredMember): number {
  return left.name.toLowerCase().localeCompare(right.name.toLowerCase());
}

function noSuchMember(name: string): MockReply {
  return refusal(404, 'NOT_FOUND_HOUSEHOLD_MEMBER', `Household member [${name}] not found`);
}

function noSuchDevice(name: string, mac: string): MockReply {
  return refusal(
    404,
    'NOT_FOUND_MEMBER_DEVICE',
    `Household member [${name}] has no device with MAC [${mac.toLowerCase()}]`,
  );
}

/** A refusal with a named cause, in the error contract of `cholewa-commons`. */
function refusal(status: number, code: string, message: string): MockReply {
  return { status, body: { errors: [{ code, message }] } };
}

/** What the service answers to a body it cannot read or that breaks a constraint: no code. */
function malformed(): MockReply {
  return { status: 400, body: { errors: [{ message: 'Malformed request body' }] } };
}
