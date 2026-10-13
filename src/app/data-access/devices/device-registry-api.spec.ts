import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ChangeOutcome } from '../../core/api/registry-changes';
import {
  DeviceDetails,
  DeviceRegistry,
  DeviceRegistryApi,
  RegisteredDevice,
} from './device-registry-api';

const LIGHT: RegisteredDevice = {
  id: 3,
  name: 'Office main light',
  room: 'office',
  kind: 'light',
  enabled: true,
  vendor: 'shelly',
  shelly: { address: '192.0.2.23', generation: 3, deviceId: 'shelly1pmg3-0a0b0c0d0e02', channel: 0 },
  lightKind: 'relay',
};

const DETAILS: DeviceDetails = {
  name: 'Office main light',
  room: 'office',
  kind: 'light',
  enabled: true,
  vendor: 'shelly',
  shelly: { address: '192.0.2.23', generation: 3, deviceId: 'shelly1pmg3-0a0b0c0d0e02', channel: 0 },
  lightKind: 'relay',
};

describe('DeviceRegistryApi', () => {
  let http: HttpTestingController;
  let registry: DeviceRegistry;
  /** Called by the registry when a change is over. */
  let afterChange: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    afterChange = vi.fn<() => void>();
    registry = TestBed.runInInjectionContext(() =>
      TestBed.inject(DeviceRegistryApi).watchDevices(afterChange),
    );
    answerTheRegistryWith([LIGHT]);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  /** The read of the registry that is due now - the first one, or the one after a change. */
  function registryCall() {
    vi.advanceTimersByTime(1);
    return http.expectOne({ method: 'GET', url: '/home/device/registry' });
  }

  function answerTheRegistryWith(devices: readonly RegisteredDevice[]): void {
    registryCall().flush(devices);
  }

  /** Lets what waits for an answer go on: a few turns of the promise queue. */
  async function settled(): Promise<void> {
    for (let turn = 0; turn < 5; turn++) {
      await Promise.resolve();
    }
  }

  /** Answers the one call of a change, then the read after it. */
  async function carriedOut(
    change: Promise<ChangeOutcome>,
    call: { method: string; url: string },
  ): Promise<{ outcome: ChangeOutcome; body: unknown }> {
    await settled();
    const request = http.expectOne(call);
    const body: unknown = request.request.body;
    request.flush({});
    await settled();
    answerTheRegistryWith([LIGHT]);
    return { outcome: await change, body };
  }

  it('reads every device of the registry', () => {
    expect(registry.value()).toEqual([LIGHT]);
    expect(registry.changing()).toBe(false);
  });

  it('registers a device with what was entered and nothing else', async () => {
    const { outcome, body } = await carriedOut(
      registry.add({
        name: 'Loft blinds',
        room: 'loft',
        kind: 'blinds',
        enabled: true,
        vendor: 'eaton',
        eaton: { gateway: 'blinds', point: 21 },
        // what is not set is left out, never sent as null
        placement: undefined,
        positioning: false,
      }),
      { method: 'POST', url: '/home/device/registry' },
    );

    expect(outcome).toEqual({ carriedOut: true });
    expect(body).toEqual({
      name: 'Loft blinds',
      room: 'loft',
      kind: 'blinds',
      enabled: true,
      vendor: 'eaton',
      eaton: { gateway: 'blinds', point: 21 },
      positioning: false,
    });
    expect(afterChange).toHaveBeenCalledTimes(1);
  });

  describe('replacing a device', () => {
    // a PUT replaces the device: what is left out is gone, so the whole form is sent
    it('sends the whole device to its id, without the id', async () => {
      const { outcome, body } = await carriedOut(
        registry.replace(LIGHT, { ...DETAILS, room: 'bedroom', lightKind: undefined }),
        { method: 'PUT', url: '/home/device/registry/3' },
      );

      expect(outcome).toEqual({ carriedOut: true });
      expect(body).toEqual({
        name: 'Office main light',
        room: 'bedroom',
        kind: 'light',
        enabled: true,
        vendor: 'shelly',
        shelly: {
          address: '192.0.2.23',
          generation: 3,
          deviceId: 'shelly1pmg3-0a0b0c0d0e02',
          channel: 0,
        },
      });
    });

    // another binding takes the place of the one the device had: the old one is not sent along
    it('sends the binding of the form and not the one the device had', async () => {
      const { body } = await carriedOut(
        registry.replace(LIGHT, {
          name: 'Office main light',
          room: 'office',
          kind: 'light',
          enabled: true,
          vendor: 'eaton',
          eaton: { gateway: 'lights', point: 7 },
        }),
        { method: 'PUT', url: '/home/device/registry/3' },
      );

      expect(body).toEqual({
        name: 'Office main light',
        room: 'office',
        kind: 'light',
        enabled: true,
        vendor: 'eaton',
        eaton: { gateway: 'lights', point: 7 },
      });
    });

    // a field a later smart-home-sdk added: this version shows nothing of it and must not drop it
    it('sends back what the registry holds and this version does not know', async () => {
      const newer = { ...LIGHT, colourTemperature: 2700 } as RegisteredDevice;

      const { body } = await carriedOut(registry.replace(newer, DETAILS), {
        method: 'PUT',
        url: '/home/device/registry/3',
      });

      expect(body).toEqual({ ...DETAILS, colourTemperature: 2700 });
    });

    // the same inside the binding the device keeps - and not for a binding the form replaced
    it('sends back what a binding holds and this version does not know, while the binding stays', async () => {
      const newer = {
        ...LIGHT,
        shelly: { ...LIGHT.shelly, profile: 'switch' },
      } as RegisteredDevice;

      const kept = await carriedOut(registry.replace(newer, { ...DETAILS, name: 'Renamed' }), {
        method: 'PUT',
        url: '/home/device/registry/3',
      });
      expect(kept.body).toEqual({
        ...DETAILS,
        name: 'Renamed',
        shelly: { ...DETAILS.shelly, profile: 'switch' },
      });

      const replaced = await carriedOut(
        registry.replace(newer, {
          name: 'Office main light',
          room: 'office',
          kind: 'light',
          enabled: true,
          vendor: 'eaton',
          eaton: { gateway: 'lights', point: 7 },
        }),
        { method: 'PUT', url: '/home/device/registry/3' },
      );
      expect(replaced.body).toEqual({
        name: 'Office main light',
        room: 'office',
        kind: 'light',
        enabled: true,
        vendor: 'eaton',
        eaton: { gateway: 'lights', point: 7 },
      });
    });
  });

  it('switches a device off and on with the operations made for it', async () => {
    const off = await carriedOut(registry.setEnabled(3, false), {
      method: 'POST',
      url: '/home/device/registry/3/disable',
    });
    expect(off.outcome).toEqual({ carriedOut: true });
    expect(off.body).toBeNull();

    await carriedOut(registry.setEnabled(3, true), {
      method: 'POST',
      url: '/home/device/registry/3/enable',
    });
  });

  it('removes a device by its id', async () => {
    const { outcome } = await carriedOut(registry.remove(3), {
      method: 'DELETE',
      url: '/home/device/registry/3',
    });

    expect(outcome).toEqual({ carriedOut: true });
  });

  // also after a refusal: what is on screen is what the registry gives when asked
  it('tells why a change was refused, after reading the registry again', async () => {
    const change = registry.add(DETAILS);
    await settled();
    expect(registry.changing()).toBe(true);
    http
      .expectOne({ method: 'POST', url: '/home/device/registry' })
      .flush(
        { errors: [{ code: 'DEVICE_CONFLICT', message: 'Device conflict' }] },
        { status: 409, statusText: 'Conflict' },
      );
    await settled();
    answerTheRegistryWith([LIGHT]);

    const outcome = await change;
    expect(outcome.carriedOut).toBe(false);
    expect(outcome.failure?.hasCode('DEVICE_CONFLICT')).toBe(true);
    expect(registry.changing()).toBe(false);
    expect(afterChange).toHaveBeenCalledTimes(1);
  });

  // every write stores a whole row: two under way for one device could undo each other
  it('refuses a second change while one is under way, without a call', async () => {
    const first = registry.setEnabled(3, false);
    await settled();

    expect(await registry.remove(3)).toEqual({ carriedOut: false });

    http.expectOne({ method: 'POST', url: '/home/device/registry/3/disable' }).flush({});
    await settled();
    answerTheRegistryWith([LIGHT]);
    expect(await first).toEqual({ carriedOut: true });
    expect(afterChange).toHaveBeenCalledTimes(1);
  });
});
