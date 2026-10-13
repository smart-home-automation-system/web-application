import { DeviceDetails, SmartDevice } from '../../data-access/devices/device-registry-api';
import { MessageKey } from '../../i18n/messages';
import { isMac, normaliseMac } from '../../shared/form-rules/form-rules';

/**
 * What the registry accepts of a device, checked before anything is sent - a copy of the
 * bounds of `smart-home-sdk` (`SmartDevice` and its bindings), of the rules `database-service`
 * adds when it stores one (the 400 `INVALID_DEVICE`) and of its unique indexes (the 409
 * `DEVICE_CONFLICT`). Each rule answers the key of the sentence that says what is wrong, or
 * `undefined`.
 *
 * The registry checks all of it again; these rules save the round trip, and say *which*
 * binding is taken, which the registry tells only in its English message.
 */
export const NAME_MIN_LENGTH = 3;
export const NAME_MAX_LENGTH = 50;
export const FIRST_GENERATION_ON_MQTT = 2;
export const GENERATIONS = [1, 2, 3, 4] as const;
export const CHANNELS = [0, 1, 2, 3] as const;
export const POINT_MIN = 1;
export const POINT_MAX = 99;

/** The three ways a device is reached; a device has exactly one. */
export const BINDINGS = ['shelly', 'eaton', 'bthome'] as const;
export type Binding = (typeof BINDINGS)[number];

const IPV4 =
  /^((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$/;
const DEVICE_ID = /^[A-Za-z0-9_-]{3,50}$/;

/**
 * The bindings a device of a kind can be reached through. What moves and what lights is wired
 * - a relay of a Shelly or an actor of the AMX system; a sensor is whatever reports it; the
 * weather station is read through a Bluetooth gateway, and such a gateway is itself a Shelly.
 * A kind this version does not know is offered all three: the registry decides.
 */
export function bindingsOf(kind: string): readonly Binding[] {
  switch (kind) {
    case 'blinds':
    case 'light':
      return ['shelly', 'eaton'];
    case 'weather station':
      return ['bthome'];
    case 'bthome gateway':
      return ['shelly'];
    default:
      return BINDINGS;
  }
}

/** The binding a device of the registry has - or `undefined` for none, or more than one. */
export function bindingOf(device: SmartDevice): Binding | undefined {
  const given = BINDINGS.filter((binding) => device[binding] !== undefined);
  return given.length === 1 ? given[0] : undefined;
}

/**
 * The vendors a device reached through a binding can have: an Eaton device is reached through
 * a gateway of the AMX system and nothing else is, the binding of a Shelly is a Shelly's, and
 * a Bluetooth sensor is of any vendor but Eaton.
 */
export function vendorsOf(binding: Binding): readonly string[] {
  switch (binding) {
    case 'shelly':
      return ['shelly'];
    case 'eaton':
      return ['eaton'];
    case 'bthome':
      return ['shelly', 'other'];
  }
}

/** A name as it is sent: without the spaces around it. */
export function normaliseName(text: string): string {
  return text.trim();
}

/** Counted in characters, as the registry counts them - a name of one letter and an emoji is two. */
export function nameProblem(text: string): MessageKey | undefined {
  const length = [...normaliseName(text)].length;
  return length < NAME_MIN_LENGTH || length > NAME_MAX_LENGTH
    ? 'devices.problem.nameLength'
    : undefined;
}

export function chosenProblem(key: MessageKey): (text: string) => MessageKey | undefined {
  return (text) => (text === '' ? key : undefined);
}

export function addressProblem(text: string): MessageKey | undefined {
  return IPV4.test(text.trim()) ? undefined : 'devices.problem.address';
}

/**
 * The id a Shelly reports under over MQTT. From the second generation on the registry refuses
 * a device without it - it could be driven and never heard; a Gen1 device has none to give,
 * and may be given one all the same.
 */
export function deviceIdProblem(text: string, generation: number): MessageKey | undefined {
  const id = text.trim();
  if (id === '') {
    return generation >= FIRST_GENERATION_ON_MQTT ? 'devices.problem.deviceIdNeeded' : undefined;
  }
  return DEVICE_ID.test(id) ? undefined : 'devices.problem.deviceIdFormat';
}

/** A whole number from 1 to 99, written in digits. */
export function pointProblem(text: string): MessageKey | undefined {
  const point = pointOf(text);
  return point === undefined ? 'devices.problem.point' : undefined;
}

export function pointOf(text: string): number | undefined {
  const digits = text.trim();
  if (!/^[0-9]{1,2}$/.test(digits)) {
    return undefined;
  }
  const point = Number(digits);
  return point >= POINT_MIN && point <= POINT_MAX ? point : undefined;
}

export function bluetoothAddressProblem(text: string): MessageKey | undefined {
  return isMac(normaliseMac(text)) ? undefined : 'devices.problem.bluetoothAddress';
}

/**
 * Whether the binding of a device is taken by another device of the registry - what the
 * registry answers with the 409 `DEVICE_CONFLICT`, here with the words for which one: a
 * channel of a Shelly by its address or by its MQTT id (a device without a channel counts as
 * one), a point of an Eaton gateway, a Bluetooth address.
 *
 * `others`: every other device of the registry - without the one being changed.
 */
export function bindingTaken(
  device: Pick<DeviceDetails, 'shelly' | 'eaton' | 'bthome'>,
  others: readonly SmartDevice[],
): MessageKey | undefined {
  const { shelly, eaton, bthome } = device;
  if (shelly !== undefined) {
    const sameChannel = others.filter(
      (other) => other.shelly !== undefined && other.shelly.channel === shelly.channel,
    );
    if (sameChannel.some((other) => other.shelly?.address === shelly.address)) {
      return 'devices.problem.shellyAddressTaken';
    }
    if (
      shelly.deviceId !== undefined &&
      sameChannel.some((other) => other.shelly?.deviceId === shelly.deviceId)
    ) {
      return 'devices.problem.shellyIdTaken';
    }
  }
  if (
    eaton !== undefined &&
    others.some(
      (other) => other.eaton?.gateway === eaton.gateway && other.eaton?.point === eaton.point,
    )
  ) {
    return 'devices.problem.eatonPointTaken';
  }
  if (bthome !== undefined && others.some((other) => other.bthome?.address === bthome.address)) {
    return 'devices.problem.bluetoothAddressTaken';
  }
  return undefined;
}

/**
 * Whether the form holds the device as the registry does - then saving it is no change, and
 * no write is made for it: every write stores the whole row.
 */
export function sameDevice(before: SmartDevice, details: DeviceDetails): boolean {
  const shown = (device: SmartDevice | DeviceDetails) =>
    JSON.stringify([
      device.name,
      device.room,
      device.kind,
      device.enabled,
      device.vendor,
      device.shelly?.address,
      device.shelly?.generation,
      device.shelly?.deviceId,
      device.shelly?.channel,
      device.eaton?.gateway,
      device.eaton?.point,
      device.bthome?.address,
      device.lightKind,
      device.placement,
      device.positioning,
    ]);
  return shown(before) === shown(details);
}
