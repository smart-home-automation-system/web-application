import type { MemberPermission, MemberRole } from '../../core/profile/profile';

/**
 * The values the registry accepts where it takes one of a fixed set - copies of the enums of
 * `smart-home-sdk` (`RoomName`, `MemberRole`, `MemberPermission`), which no endpoint lists.
 * They are what the administration **offers**; what the registry already holds is shown and
 * sent back as it is, known here or not, so a value added to the SDK before it is added here
 * is never dropped by an edit.
 *
 * A value added there has to be added here to be offered; one renamed there needs a migration
 * of the rows of the registry, and this list with it.
 */
export const ROOM_NAMES: readonly string[] = [
  'loft',
  'wardrobe',
  'bedroom',
  'livia',
  'tobi',
  'office',
  'bathroom up',
  'hall_up',
  'stairs',
  'kitchen',
  'living room',
  'cinema',
  'hall down',
  'bathroom down',
  'entrance',
  'garage',
  'boiler',
  'garden',
  'sauna',
  'sanctum',
];

export const MEMBER_ROLES = ['admin', 'resident'] as const satisfies readonly MemberRole[];

export const MEMBER_PERMISSIONS = ['heating_switch'] as const satisfies readonly MemberPermission[];

/**
 * The values of the device registry (`DeviceKind`, `LightKind`, `BlindsPlacement`,
 * `SmartVendor`, `EatonGatewayType` of `smart-home-sdk` 1.9.0) - copies, like the ones above,
 * and under the same rule: they are what the administration of the devices offers, and what
 * the registry already holds is shown and sent back as it is.
 */
export const DEVICE_KINDS = [
  'blinds',
  'light',
  'opening sensor',
  'motion sensor',
  'presence sensor',
  'temperature sensor',
  'weather station',
  'bthome gateway',
  'push button',
] as const;

export type DeviceKind = (typeof DEVICE_KINDS)[number];

export const LIGHT_KINDS = ['relay', 'dimmer', 'rgbw'] as const;

export type LightKind = (typeof LIGHT_KINDS)[number];

export const PLACEMENTS = ['external', 'internal'] as const;

export type Placement = (typeof PLACEMENTS)[number];

export const VENDORS = ['shelly', 'eaton', 'other'] as const;

export type Vendor = (typeof VENDORS)[number];

export const EATON_GATEWAYS = ['blinds', 'lights'] as const;

export type EatonGateway = (typeof EATON_GATEWAYS)[number];
