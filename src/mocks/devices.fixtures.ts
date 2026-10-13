import { isRecord } from '../app/core/util/is-record';
import { SmartDevice } from '../app/data-access/devices/device-registry-api';
import {
  DEVICE_KINDS,
  EATON_GATEWAYS,
  LIGHT_KINDS,
  PLACEMENTS,
  ROOM_NAMES,
  VENDORS,
} from '../app/data-access/household/registry-values';
import type { MockReply } from './handlers';

/**
 * The device registry of the mock house (`database-service`), which can be changed: every
 * write of the administration page changes what the next reads answer, in the memory of the
 * page - a reload is the registry as it started. It refuses what the real registry refuses,
 * with the same status and the same `code`.
 *
 * Invented devices: the addresses are of the range reserved for documentation, the device ids
 * and the Bluetooth addresses made up. The blinds of the living room are switched off.
 */
type StoredDevice = SmartDevice & { id: number; name: string; room: string; kind: string };

const AT_THE_START: readonly StoredDevice[] = [
  {
    id: 1,
    name: 'Office window blinds',
    room: 'office',
    kind: 'blinds',
    enabled: true,
    vendor: 'shelly',
    shelly: { address: '192.0.2.21', generation: 1 },
    placement: 'external',
    positioning: true,
  },
  {
    id: 2,
    name: 'Office door blinds',
    room: 'office',
    kind: 'blinds',
    enabled: true,
    vendor: 'shelly',
    shelly: {
      address: '192.0.2.22',
      generation: 2,
      deviceId: 'shellyplus2pm-0a0b0c0d0e01',
      channel: 0,
    },
    placement: 'external',
    positioning: true,
  },
  {
    id: 3,
    name: 'Office main light',
    room: 'office',
    kind: 'light',
    enabled: true,
    vendor: 'shelly',
    shelly: {
      address: '192.0.2.23',
      generation: 3,
      deviceId: 'shelly1pmg3-0a0b0c0d0e02',
      channel: 0,
    },
    lightKind: 'relay',
  },
  {
    id: 4,
    name: 'Office temperature sensor 48',
    room: 'office',
    kind: 'temperature sensor',
    enabled: true,
    vendor: 'eaton',
    eaton: { gateway: 'blinds', point: 48 },
  },
  {
    id: 5,
    name: 'Living room dimmer',
    room: 'living room',
    kind: 'light',
    enabled: true,
    vendor: 'eaton',
    eaton: { gateway: 'lights', point: 12 },
    lightKind: 'dimmer',
  },
  {
    id: 6,
    name: 'Living room temperature sensor 52',
    room: 'living room',
    kind: 'temperature sensor',
    enabled: true,
    vendor: 'eaton',
    eaton: { gateway: 'blinds', point: 52 },
  },
  {
    id: 7,
    name: 'Living room terrace blinds',
    room: 'living room',
    kind: 'blinds',
    enabled: false,
    vendor: 'eaton',
    eaton: { gateway: 'blinds', point: 21 },
    placement: 'external',
    positioning: false,
  },
  {
    id: 8,
    name: 'Hall motion sensor',
    room: 'hall down',
    kind: 'motion sensor',
    enabled: true,
    vendor: 'shelly',
    shelly: { address: '192.0.2.31', generation: 1 },
  },
  {
    id: 9,
    name: 'Kitchen window sensor',
    room: 'kitchen',
    kind: 'opening sensor',
    enabled: true,
    vendor: 'shelly',
    bthome: { address: '7c:c6:b6:00:00:01' },
  },
  {
    id: 10,
    name: 'Garden gateway',
    room: 'garden',
    kind: 'bthome gateway',
    enabled: true,
    vendor: 'shelly',
    shelly: { address: '192.0.2.40', generation: 2, deviceId: 'shellyblugw-0a0b0c0d0e03' },
  },
  {
    id: 11,
    name: 'Weather station',
    room: 'garden',
    kind: 'weather station',
    enabled: true,
    vendor: 'other',
    bthome: { address: '7c:c6:b6:00:00:02' },
  },
  {
    id: 12,
    name: 'Loft presence sensor',
    room: 'loft',
    kind: 'presence sensor',
    enabled: true,
    vendor: 'shelly',
    shelly: { address: '192.0.2.41', generation: 4, deviceId: 'shellypresence-0a0b0c0d0e04' },
  },
  {
    id: 13,
    name: 'Bedroom light strip',
    room: 'bedroom',
    kind: 'light',
    enabled: true,
    vendor: 'shelly',
    shelly: {
      address: '192.0.2.50',
      generation: 2,
      deviceId: 'shellyplusrgbwpm-0a0b0c0d0e05',
      channel: 0,
    },
    lightKind: 'rgbw',
  },
];

let devices: StoredDevice[] = structuredClone([...AT_THE_START]);
let nextId = AT_THE_START.length + 1;

/** The registry as it started - for a unit test that changed it. */
export function resetDevices(): void {
  devices = structuredClone([...AT_THE_START]);
  nextId = AT_THE_START.length + 1;
}

/** `GET /home/device/registry`: every device, by room and then by name, as the service sorts. */
export function deviceRegistry(): SmartDevice[] {
  return [...devices].sort(byRoomAndName).map((device) => structuredClone(device));
}

export function addDevice(body: unknown): MockReply {
  const device = deviceOf(body);
  if (device === undefined) {
    return malformed();
  }
  const refused = refusalOf(device, undefined);
  if (refused) {
    return refused;
  }
  // an id in the payload is ignored: the registry gives it
  const added: StoredDevice = { ...device, id: nextId++ };
  devices.push(added);
  return { status: 201, body: structuredClone(added) };
}

/** `PUT`: the whole device; the id and the kind stay, what is left out is gone. */
export function replaceDevice(id: string, body: unknown): MockReply {
  const device = deviceOf(body);
  if (device === undefined) {
    return malformed();
  }
  const existing = find(id);
  if (existing === undefined) {
    return noSuchDevice(id);
  }
  if (existing.kind !== device.kind) {
    return refusal(
      400,
      'INVALID_DEVICE',
      'Invalid device',
      `The kind of a device cannot be changed: device ${existing.id} is of the kind [${existing.kind}]`,
    );
  }
  const refused = refusalOf(device, existing);
  if (refused) {
    return refused;
  }
  const replaced: StoredDevice = { ...device, id: existing.id };
  devices = devices.map((one) => (one === existing ? replaced : one));
  return { status: 200, body: structuredClone(replaced) };
}

export function setDeviceEnabled(id: string, enabled: boolean): MockReply {
  const existing = find(id);
  if (existing === undefined) {
    return noSuchDevice(id);
  }
  const switched: StoredDevice = { ...existing, enabled };
  devices = devices.map((one) => (one === existing ? switched : one));
  return { status: 200, body: structuredClone(switched) };
}

export function removeDevice(id: string): MockReply {
  const existing = find(id);
  if (existing === undefined) {
    return noSuchDevice(id);
  }
  devices = devices.filter((one) => one !== existing);
  return { status: 204, body: null };
}

// ---- what the registry checks ----

const IPV4 =
  /^((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$/;
const DEVICE_ID = /^[A-Za-z0-9_-]{3,50}$/;
const MAC = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/;

type Draft = Omit<StoredDevice, 'id'>;

/** The device of a body the model accepts (`@Valid` on `SmartDevice`) - or `undefined`. */
function deviceOf(body: unknown): Draft | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  const { name, room, kind, enabled, vendor, shelly, eaton, bthome } = body;
  const { lightKind, placement, positioning } = body;
  if (typeof name !== 'string' || name.length < 3 || name.length > 50) {
    return undefined;
  }
  if (!oneOf(room, ROOM_NAMES) || !oneOf(kind, DEVICE_KINDS) || !oneOf(vendor, VENDORS)) {
    return undefined;
  }
  if (typeof enabled !== 'boolean') {
    return undefined;
  }
  if (lightKind !== undefined && !oneOf(lightKind, LIGHT_KINDS)) {
    return undefined;
  }
  if (placement !== undefined && !oneOf(placement, PLACEMENTS)) {
    return undefined;
  }
  if (positioning !== undefined && typeof positioning !== 'boolean') {
    return undefined;
  }
  const bindings = { shelly: shellyOf(shelly), eaton: eatonOf(eaton), bthome: bthomeOf(bthome) };
  if (Object.values(bindings).includes(null)) {
    return undefined;
  }
  return {
    name,
    room,
    kind,
    enabled,
    vendor,
    ...(bindings.shelly ? { shelly: bindings.shelly } : {}),
    ...(bindings.eaton ? { eaton: bindings.eaton } : {}),
    ...(bindings.bthome ? { bthome: bindings.bthome } : {}),
    ...(lightKind === undefined ? {} : { lightKind }),
    ...(placement === undefined ? {} : { placement }),
    ...(positioning === undefined ? {} : { positioning }),
  };
}

function oneOf(value: unknown, known: readonly string[]): value is string {
  return typeof value === 'string' && known.includes(value);
}

/** A binding as the model reads it: `undefined` when it is not there, `null` when it is wrong. */
function shellyOf(value: unknown): SmartDevice['shelly'] | null {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    return null;
  }
  const { address, generation, deviceId, channel } = value;
  if (typeof address !== 'string' || !IPV4.test(address)) {
    return null;
  }
  if (!whole(generation, 1, 4)) {
    return null;
  }
  if (deviceId !== undefined && (typeof deviceId !== 'string' || !DEVICE_ID.test(deviceId))) {
    return null;
  }
  if (channel !== undefined && !whole(channel, 0, 3)) {
    return null;
  }
  return {
    address,
    generation,
    ...(deviceId === undefined ? {} : { deviceId }),
    ...(channel === undefined ? {} : { channel }),
  };
}

function eatonOf(value: unknown): SmartDevice['eaton'] | null {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value) || !oneOf(value['gateway'], EATON_GATEWAYS)) {
    return null;
  }
  const point = value['point'];
  return whole(point, 1, 99) ? { gateway: value['gateway'], point } : null;
}

function bthomeOf(value: unknown): SmartDevice['bthome'] | null {
  if (value === undefined) {
    return undefined;
  }
  return isRecord(value) && typeof value['address'] === 'string' && MAC.test(value['address'])
    ? { address: value['address'] }
    : null;
}

function whole(value: unknown, least: number, most: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= least && value <= most;
}

/** What the registry refuses of a device the model accepts: a broken rule, or a taken binding. */
function refusalOf(device: Draft, self: StoredDevice | undefined): MockReply | undefined {
  const broken = brokenRuleOf(device);
  if (broken !== undefined) {
    return refusal(400, 'INVALID_DEVICE', 'Invalid device', broken);
  }
  const taken = takenBindingOf(
    device,
    devices.filter((one) => one !== self),
  );
  return taken === undefined
    ? undefined
    : refusal(409, 'DEVICE_CONFLICT', 'Device conflict', taken);
}

/** `DeviceRules` of `database-service`, in its words. */
function brokenRuleOf(device: Draft): string | undefined {
  const given = (['shelly', 'eaton', 'bthome'] as const).filter(
    (binding) => device[binding] !== undefined,
  );
  if (given.length !== 1) {
    return `A device is reached through exactly one binding - shelly, eaton or bthome - and this one has ${
      given.length === 0 ? 'none' : given.join(' and ')
    }`;
  }
  const [binding] = given;
  if (
    (device.vendor === 'eaton') !== (binding === 'eaton') ||
    (binding === 'shelly' && device.vendor !== 'shelly')
  ) {
    return `A device of the vendor [${device.vendor}] is not reached through the binding [${binding}]`;
  }
  const possible = possibleBindingsOf(device.kind);
  if (!possible.includes(binding)) {
    return `A device of the kind [${device.kind}] is not reached through the binding [${binding}], only through: ${possible.join(', ')}`;
  }
  if (
    device.shelly !== undefined &&
    (device.shelly.generation ?? 0) >= 2 &&
    device.shelly.deviceId === undefined
  ) {
    return `A Shelly of generation ${device.shelly.generation} needs its deviceId - the id it reports under over MQTT`;
  }
  if (device.lightKind !== undefined && device.kind !== 'light') {
    return `lightKind describes a light, not a device of the kind [${device.kind}]`;
  }
  if (
    (device.placement !== undefined || device.positioning !== undefined) &&
    device.kind !== 'blinds'
  ) {
    return `placement and positioning describe blinds, not a device of the kind [${device.kind}]`;
  }
  return undefined;
}

function possibleBindingsOf(kind: string): readonly string[] {
  switch (kind) {
    case 'blinds':
    case 'light':
      return ['shelly', 'eaton'];
    case 'weather station':
      return ['bthome'];
    case 'bthome gateway':
      return ['shelly'];
    default:
      return ['shelly', 'eaton', 'bthome'];
  }
}

/** The unique indexes of the registry, in the words of its answer. */
function takenBindingOf(device: Draft, others: readonly StoredDevice[]): string | undefined {
  const { shelly, eaton, bthome } = device;
  if (shelly !== undefined) {
    const channel = shelly.channel === undefined ? '' : `, channel ${shelly.channel}`;
    const sameChannel = others.filter(
      (one) => one.shelly !== undefined && one.shelly.channel === shelly.channel,
    );
    if (sameChannel.some((one) => one.shelly?.address === shelly.address)) {
      return `A device is already registered for the Shelly at [${shelly.address}]${channel}`;
    }
    if (
      shelly.deviceId !== undefined &&
      sameChannel.some((one) => one.shelly?.deviceId === shelly.deviceId)
    ) {
      return `A device is already registered for the Shelly with the id [${shelly.deviceId}]${channel}`;
    }
  }
  if (
    eaton !== undefined &&
    others.some(
      (one) => one.eaton?.gateway === eaton.gateway && one.eaton?.point === eaton.point,
    )
  ) {
    return `A device is already registered for the point [${eaton.point}] of the Eaton gateway [${eaton.gateway}]`;
  }
  if (bthome !== undefined && others.some((one) => one.bthome?.address === bthome.address)) {
    return `A device is already registered for the Bluetooth address [${bthome.address}]`;
  }
  return undefined;
}

function find(id: string): StoredDevice | undefined {
  return devices.find((one) => String(one.id) === id);
}

function byRoomAndName(left: StoredDevice, right: StoredDevice): number {
  return (
    ROOM_NAMES.indexOf(left.room) - ROOM_NAMES.indexOf(right.room) ||
    left.name.toLowerCase().localeCompare(right.name.toLowerCase())
  );
}

function noSuchDevice(id: string): MockReply {
  return refusal(404, 'NOT_FOUND_DEVICE', 'Device not found', `Device not found for id: ${id}`);
}

/** A refusal with a named cause, in the error contract of `cholewa-commons`. */
function refusal(status: number, code: string, message: string, details: string): MockReply {
  return { status, body: { errors: [{ code, details, message }] } };
}

/** What the service answers to a body the model refuses: no code. */
function malformed(): MockReply {
  return { status: 400, body: { errors: [{ message: 'Missing or invalid parameter' }] } };
}
