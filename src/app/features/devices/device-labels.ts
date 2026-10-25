import {
  DeviceKind,
  LightKind,
  Placement,
  Vendor,
} from '../../data-access/household/registry-values';
import { MessageKey } from '../../i18n/messages';
import { Binding } from './device-rules';

/**
 * The words and the icons for the values of the device registry. The records are typed by the
 * values, so one added to `registry-values.ts` without a text does not compile.
 */
export const KIND_LABELS: Readonly<Record<DeviceKind, MessageKey>> = {
  blinds: 'devices.kind.blinds',
  light: 'devices.kind.light',
  'opening sensor': 'devices.kind.openingSensor',
  'motion sensor': 'devices.kind.motionSensor',
  'presence sensor': 'devices.kind.presenceSensor',
  'temperature sensor': 'devices.kind.temperatureSensor',
  'weather station': 'devices.kind.weatherStation',
  'bthome gateway': 'devices.kind.bthomeGateway',
  'push button': 'devices.kind.pushButton',
  appliance: 'devices.kind.appliance',
};

/** Names of Material Symbols. */
const KIND_ICONS: Readonly<Record<DeviceKind, string>> = {
  blinds: 'blinds',
  light: 'lightbulb',
  'opening sensor': 'sensor_door',
  'motion sensor': 'sensors',
  'presence sensor': 'person_search',
  'temperature sensor': 'device_thermostat',
  'weather station': 'partly_cloudy_day',
  'bthome gateway': 'bluetooth_connected',
  'push button': 'touch_app',
  appliance: 'local_laundry_service',
};

export const LIGHT_KIND_LABELS: Readonly<Record<LightKind, MessageKey>> = {
  relay: 'devices.lightKind.relay',
  dimmer: 'devices.lightKind.dimmer',
  rgbw: 'devices.lightKind.rgbw',
};

export const PLACEMENT_LABELS: Readonly<Record<Placement, MessageKey>> = {
  external: 'devices.placement.external',
  internal: 'devices.placement.internal',
};

export const VENDOR_LABELS: Readonly<Record<Vendor, MessageKey>> = {
  shelly: 'devices.vendor.shelly',
  eaton: 'devices.vendor.eaton',
  other: 'devices.vendor.other',
};

export const BINDING_LABELS: Readonly<Record<Binding, MessageKey>> = {
  shelly: 'devices.binding.shelly',
  eaton: 'devices.binding.eaton',
  bthome: 'devices.binding.bthome',
};

/**
 * The key of the text for a value as the registry sent it, or `undefined` for one this version
 * does not know - the caller then prints the value as it came. (`Object.hasOwn`: the value
 * comes from outside, and "constructor" must not find something on a plain object.)
 */
function labelIn<K extends string>(
  labels: Readonly<Record<K, MessageKey>>,
  value: string | undefined,
): MessageKey | undefined {
  return value !== undefined && Object.hasOwn(labels, value) ? labels[value as K] : undefined;
}

export const kindLabel = (kind: string | undefined) => labelIn(KIND_LABELS, kind);
export const lightKindLabel = (kind: string | undefined) => labelIn(LIGHT_KIND_LABELS, kind);
export const placementLabel = (placement: string | undefined) =>
  labelIn(PLACEMENT_LABELS, placement);
export const vendorLabel = (vendor: string | undefined) => labelIn(VENDOR_LABELS, vendor);

/** The icon of a kind; a kind this version does not know gets the one of "a device". */
export function kindIcon(kind: string | undefined): string {
  return kind !== undefined && Object.hasOwn(KIND_ICONS, kind)
    ? KIND_ICONS[kind as DeviceKind]
    : 'devices_other';
}
