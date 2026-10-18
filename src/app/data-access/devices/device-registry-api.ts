import { Injectable, Signal, inject } from '@angular/core';

import { ApiClient } from '../../core/api/api-client';
import { PollingResource, pollingResource } from '../../core/api/polling-resource';
import { ChangeOutcome, registryChanges } from '../../core/api/registry-changes';

/** How a Shelly is reached: over HTTP by its address, and what it calls itself over MQTT. */
export interface ShellyBinding {
  /** The IPv4 address of the device on the home network. */
  readonly address?: string;
  /** 1 to 4, the number the device reports about itself; from 2 on it reports over MQTT. */
  readonly generation?: number;
  /** The id it reports under over MQTT; a Gen1 device has none. */
  readonly deviceId?: string;
  /** The channel this entry stands for (0-3); left out for a device without channels. */
  readonly channel?: number;
}

/** A data point on one of the two gateways of the AMX system. */
export interface EatonBinding {
  /** `blinds` or `lights`. */
  readonly gateway?: string;
  /** 1 to 99. */
  readonly point?: number;
}

/** A Bluetooth sensor: known by its own address, bound to no gateway. */
export interface BthomeBinding {
  /** Lowercase, colon separated. */
  readonly address?: string;
}

/**
 * A device as the registry holds it (`GET /home/device/registry`, `SmartDevice` of
 * `smart-home-sdk` 1.8.0 - `openingSensors` since 1.11.0 - served by `database-service` and
 * routed by the gateway from 0.5.0).
 * Every field is optional here: nothing checks an answer, and the service leaves out what a
 * device does not have - two of the three bindings always, and the fields of another kind.
 *
 * The values of `room`, `kind` and `vendor` are plain text: the registry may hold one this
 * version does not know, which is shown as it comes.
 */
export interface SmartDevice {
  /** Given by the registry; what a device is addressed by. */
  readonly id?: number;
  readonly name?: string;
  readonly room?: string;
  readonly kind?: string;
  /** Whether the services use the device. */
  readonly enabled?: boolean;
  readonly vendor?: string;
  readonly shelly?: ShellyBinding;
  readonly eaton?: EatonBinding;
  readonly bthome?: BthomeBinding;
  /** A light only: `relay`, `dimmer` or `rgbw`. */
  readonly lightKind?: string;
  /** Blinds only: `external` or `internal`. */
  readonly placement?: string;
  /** Blinds only: whether they can be sent to a position; missing means "not known". */
  readonly positioning?: boolean;
  /**
   * Blinds only (HAS-290): the ids of the opening sensors on their window, in the order given;
   * missing means none - a window without a sensor, which the blinds service takes as closed.
   */
  readonly openingSensors?: readonly number[];
}

/** A device that can be addressed: one the registry gave an id. */
export type RegisteredDevice = SmartDevice & { readonly id: number };

/**
 * What the administration sets of a device - the whole of it: the registry has no partial
 * update, a `PUT` replaces the device and what is left out is gone. Exactly one binding.
 */
export interface DeviceDetails {
  readonly name: string;
  readonly room: string;
  readonly kind: string;
  readonly enabled: boolean;
  readonly vendor: string;
  readonly shelly?: ShellyBinding;
  readonly eaton?: EatonBinding;
  readonly bthome?: BthomeBinding;
  readonly lightKind?: string;
  readonly placement?: string;
  readonly positioning?: boolean;
  readonly openingSensors?: readonly number[];
}

/**
 * The device registry for its administration: the devices, kept fresh by polling, and the
 * ways to change them. There is no optimistic state - `value` is only ever what the registry
 * answered, and after a change, carried out or not, it is asked again before the change counts
 * as over.
 *
 * Every change resolves with how it ended - never rejects - and is one call. One change at a
 * time: a second one asked for while `changing` is refused without a call.
 */
export interface DeviceRegistry extends PollingResource<readonly SmartDevice[] | null> {
  /** True from the moment a change is sent until the registry has been read again. */
  readonly changing: Signal<boolean>;
  add(device: DeviceDetails): Promise<ChangeOutcome>;
  /**
   * Replaces the device as the registry holds it now with what the form holds. The registry
   * keeps the id, the kind and the time of registration; everything else is what is sent, and
   * what is not sent is gone. So what `before` carries and this version does not know of -
   * a field a later `smart-home-sdk` added, to the device or to the binding it keeps - is sent
   * back with the rest.
   */
  replace(before: RegisteredDevice, device: DeviceDetails): Promise<ChangeOutcome>;
  /** Switches a device on or off for the services, without touching anything else of it. */
  setEnabled(id: number, enabled: boolean): Promise<ChangeOutcome>;
  remove(id: number): Promise<ChangeOutcome>;
}

// the registry changes when somebody changes it, which is this page or a tool next to it
const POLL_REGISTRY_EVERY_MS = 60_000;

/** The fields this version sets itself: of these the form is the truth, of the others `before`. */
const KNOWN_FIELDS: readonly string[] = [
  'id',
  'name',
  'room',
  'kind',
  'enabled',
  'vendor',
  'shelly',
  'eaton',
  'bthome',
  'lightKind',
  'placement',
  'positioning',
  'openingSensors',
] satisfies readonly (keyof SmartDevice)[];

@Injectable({ providedIn: 'root' })
export class DeviceRegistryApi {
  private readonly api = inject(ApiClient);

  /**
   * Every device of the house, with the ways to change the registry. **For the administration
   * page**: the registry carries the addresses of the devices on the home network.
   *
   * `afterChange` is called when a change is over - carried out or not, the registry read
   * again.
   *
   * Call in an injection context: the polling lives as long as the caller. A change that is on
   * its way when the caller goes is not aborted with it - a write cut off halfway is carried
   * out or not, and nobody would know which. What does cut it off is the time limit of
   * `ApiClient`: such a change fails as `network`, which says "no answer", not "not carried
   * out".
   */
  /**
   * The switched-on devices of one room, read only (HAS-254, "My room": its sensors), **read for
   * every member** - the one read of the device registry outside the administration. The answer
   * holds what the registry holds of those devices, their addresses included; the page shows their
   * names and kinds only (accepted with the task: the separation is UI-only while nothing behind the
   * gateway is authenticated). The
   * name is read when a call is made; the caller is made anew for another room. Call in an
   * injection context.
   */
  watchRoom(room: () => string): PollingResource<readonly SmartDevice[] | null> {
    return pollingResource(
      () =>
        this.api.get<readonly SmartDevice[] | null>('/device/registry', {
          room: room(),
          enabled: 'true',
        }),
      { intervalMs: POLL_REGISTRY_EVERY_MS },
    );
  }

  watchDevices(afterChange?: () => void): DeviceRegistry {
    const registry = pollingResource(
      () => this.api.get<readonly SmartDevice[] | null>('/device/registry'),
      { intervalMs: POLL_REGISTRY_EVERY_MS },
    );
    const { changing, change } = registryChanges(registry, afterChange);

    const device = (id: number) => `/device/registry/${id}`;

    return {
      ...registry,
      changing,
      add: (details) => change([this.api.post('/device/registry', sent(details))]),
      replace: (before, details) =>
        change([this.api.put(device(before.id), replaced(before, details))]),
      setEnabled: (id, enabled) =>
        change([this.api.post(`${device(id)}/${enabled ? 'enable' : 'disable'}`)]),
      remove: (id) => change([this.api.delete(device(id))]),
    };
  }
}

/** A device as it is sent: what is not set is left out, never sent as `null`. */
function sent(details: DeviceDetails): Record<string, unknown> {
  return Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined));
}

/** The fields of each binding this version sets itself. */
const KNOWN_BINDING_FIELDS: Readonly<Record<string, readonly string[]>> = {
  shelly: [
    'address',
    'generation',
    'deviceId',
    'channel',
  ] satisfies readonly (keyof ShellyBinding)[],
  eaton: ['gateway', 'point'] satisfies readonly (keyof EatonBinding)[],
  bthome: ['address'] satisfies readonly (keyof BthomeBinding)[],
};

/**
 * The body of a `PUT`: the form, and with it whatever the device holds that this version does
 * not know of - at the top, and inside the binding the device keeps. A binding the form no
 * longer has is not sent, with whatever it held.
 */
function replaced(before: SmartDevice, details: DeviceDetails): Record<string, unknown> {
  const body: Record<string, unknown> = {
    ...unknownFieldsOf(before, KNOWN_FIELDS),
    ...sent(details),
  };
  for (const [binding, known] of Object.entries(KNOWN_BINDING_FIELDS)) {
    const held: unknown = (before as Record<string, unknown>)[binding];
    const kept: unknown = body[binding];
    if (isObject(held) && isObject(kept)) {
      body[binding] = { ...unknownFieldsOf(held, known), ...kept };
    }
  }
  return body;
}

function unknownFieldsOf(holder: object, known: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(holder).filter(([field]) => !known.includes(field)));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
