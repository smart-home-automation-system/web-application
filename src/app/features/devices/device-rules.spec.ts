import { SmartDevice } from '../../data-access/devices/device-registry-api';
import { DEVICE_KINDS } from '../../data-access/household/registry-values';
import {
  addressProblem,
  batterySerialProblem,
  bindingOf,
  bindingsOf,
  bindingTaken,
  blindsUsing,
  bluetoothAddressProblem,
  channelNeeded,
  channelsOf,
  generationsOf,
  chosenProblem,
  deviceIdProblem,
  isZone,
  loggerSerialOf,
  loggerSerialProblem,
  nameProblem,
  openingSensorsOf,
  optionalAddressProblem,
  pointOf,
  pointProblem,
  registrationProblem,
  sameDevice,
  serialProblem,
  vendorsOf,
} from './device-rules';

const SHELLY: SmartDevice = {
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
};
const GATEWAY: SmartDevice = {
  id: 10,
  vendor: 'shelly',
  kind: 'bthome gateway',
  shelly: { address: '192.0.2.40', generation: 2, deviceId: 'shellyblugw-0a0b0c0d0e03' },
};
const EATON: SmartDevice = { id: 4, vendor: 'eaton', eaton: { gateway: 'blinds', point: 48 } };
const SENSOR: SmartDevice = { id: 9, vendor: 'shelly', bthome: { address: '7c:c6:b6:00:00:01' } };
const INVERTER: SmartDevice = {
  id: 64,
  kind: 'inverter',
  vendor: 'other',
  inverter: { brand: 'solax', serialNumber: 'MOCKX0000000001', registrationNumber: 'SMOCK00001' },
};
const REGISTRY = [SHELLY, GATEWAY, EATON, SENSOR, INVERTER];

describe('the rules of a device', () => {
  // the table of DeviceRules in database-service: what moves and lights is wired, a sensor is
  // whatever reports it, the weather station is Bluetooth, a gateway a Shelly
  it.each([
    ['blinds', ['shelly', 'eaton']],
    ['light', ['shelly', 'eaton']],
    ['opening sensor', ['shelly', 'eaton', 'bthome']],
    ['motion sensor', ['shelly', 'eaton', 'bthome']],
    ['presence sensor', ['shelly', 'eaton', 'bthome']],
    ['temperature sensor', ['shelly', 'eaton', 'bthome']],
    ['weather station', ['bthome']],
    ['bthome gateway', ['shelly']],
    ['push button', ['shelly', 'eaton']],
    // HAS-282: an appliance is the plug it runs on
    ['appliance', ['shelly']],
    // HAS-326: an inverter is reached by its binding alone
    ['inverter', ['inverter']],
    // HAS-313: the water valve is a Shelly on the network
    ['water valve', ['shelly']],
  ])('reach a device of the kind "%s" through %j', (kind, bindings) => {
    expect(bindingsOf(kind)).toEqual(bindings);
  });

  it('have an answer for every kind the registry offers', () => {
    for (const kind of DEVICE_KINDS) {
      expect(bindingsOf(kind).length).toBeGreaterThan(0);
    }
  });

  // the registry decides about a kind this version has never heard of - but the inverter binding is
  // the part of the inverter alone
  it('offer every binding but the inverter one for a kind they do not know', () => {
    expect(bindingsOf('wind sensor')).toEqual(['shelly', 'eaton', 'bthome']);
  });

  it('give each binding the vendors the registry accepts for it', () => {
    expect(vendorsOf('shelly')).toEqual(['shelly']);
    expect(vendorsOf('eaton')).toEqual(['eaton']);
    // a Bluetooth sensor is of any vendor but Eaton
    expect(vendorsOf('bthome')).toEqual(['shelly', 'other']);
    // an inverter is of none of the vendors the registry names
    expect(vendorsOf('inverter')).toEqual(['other']);
  });

  // HAS-260: the registry takes a zone (200 to 299) as the channel of a presence sensor alone
  it('offer the main zone to a presence sensor and the outputs to every kind', () => {
    expect(channelsOf('presence sensor')).toEqual([0, 1, 2, 3, 200]);
    expect(channelsOf('light')).toEqual([0, 1, 2, 3]);
    expect(channelsOf('wind sensor')).toEqual([0, 1, 2, 3]);
  });

  // HAS-313 (checkWaterValve of database-service 0.21.0): a water valve is on the channel 0, from the second
  // generation on; a valve the registry holds otherwise keeps what it has on offer
  it('offer a water valve the channel 0 and the generations from the second on', () => {
    expect(channelNeeded('water valve')).toBe(true);
    expect(channelNeeded('light')).toBe(false);
    expect(channelsOf('water valve')).toEqual([0]);
    expect(channelsOf('water valve', 2)).toEqual([0, 2]);
    expect(generationsOf('water valve')).toEqual([2, 3, 4]);
    expect(generationsOf('water valve', 1)).toEqual([1, 2, 3, 4]);
    expect(generationsOf('light')).toEqual([1, 2, 3, 4]);
  });

  // a channel the registry holds is never dropped by a form that does not offer it
  it('keep the channel a device holds on offer', () => {
    expect(channelsOf('presence sensor', 201)).toEqual([0, 1, 2, 3, 200, 201]);
    expect(channelsOf('presence sensor', 200)).toEqual([0, 1, 2, 3, 200]);
    expect(channelsOf('light', 2)).toEqual([0, 1, 2, 3]);
  });

  it('tell a zone from an output', () => {
    expect(isZone(3)).toBe(false);
    expect(isZone(200)).toBe(true);
    expect(isZone(299)).toBe(true);
    expect(isZone('250')).toBe(false);
    expect(isZone('{{ zone }}')).toBe(false);
  });

  it('read the one binding a device has', () => {
    expect(bindingOf(INVERTER)).toBe('inverter');
    expect(bindingOf(SHELLY)).toBe('shelly');
    expect(bindingOf(EATON)).toBe('eaton');
    expect(bindingOf(SENSOR)).toBe('bthome');
    expect(bindingOf({ name: 'Nothing' })).toBeUndefined();
    expect(bindingOf({ ...SHELLY, eaton: { gateway: 'blinds', point: 1 } })).toBeUndefined();
  });

  it.each([
    ['', 'devices.problem.nameLength'],
    ['ab', 'devices.problem.nameLength'],
    ['  ab  ', 'devices.problem.nameLength'],
    // counted in characters, as the registry counts: a letter and an emoji are two
    ['a\u{1F4A1}', 'devices.problem.nameLength'],
    ['x'.repeat(51), 'devices.problem.nameLength'],
    ['abc', undefined],
    ['ab\u{1F4A1}', undefined],
    ['x'.repeat(50), undefined],
    // the most is counted in the units of the string, as @Size of the model counts: an emoji
    // is two of the fifty
    ['💡'.repeat(25), undefined],
    ['💡'.repeat(26), 'devices.problem.nameLength'],
  ])('judge the name "%s"', (name, problem) => {
    expect(nameProblem(name)).toBe(problem);
  });

  it('ask for a choice where one has to be made', () => {
    expect(chosenProblem('devices.problem.room')('')).toBe('devices.problem.room');
    expect(chosenProblem('devices.problem.room')('office')).toBeUndefined();
  });

  it.each(['192.0.2.17', '0.0.0.0', '255.255.255.255', ' 192.0.2.17 '])(
    'take "%s" for an address',
    (address) => {
      expect(addressProblem(address)).toBeUndefined();
    },
  );

  it.each([
    '',
    '192.0.2',
    '192.0.2.256',
    '192.0.2.017',
    '192.0.2.17:80',
    'office.local',
    'a.b.c.d',
  ])('refuse "%s" as an address', (address) => {
    expect(addressProblem(address)).toBe('devices.problem.address');
  });

  describe('about the id of a Shelly', () => {
    // from the second generation on a device without it could be driven and never heard
    it.each([2, 3, 4])('need it for generation %i', (generation) => {
      expect(deviceIdProblem('', generation)).toBe('devices.problem.deviceIdNeeded');
      expect(deviceIdProblem('  ', generation)).toBe('devices.problem.deviceIdNeeded');
    });

    it('do not need it for generation 1, and take one that is given', () => {
      expect(deviceIdProblem('', 1)).toBeUndefined();
      expect(deviceIdProblem('shellyswitch25-A1B2C3', 1)).toBeUndefined();
    });

    // no dot and no slash: either would split the routing key of what the device publishes
    it.each(['ab', 'shelly.plus', 'shelly/plus', 'shelly plus', 'x'.repeat(51)])(
      'refuse the id "%s"',
      (id) => {
        expect(deviceIdProblem(id, 2)).toBe('devices.problem.deviceIdFormat');
      },
    );

    it.each(['shellyplus2pm-a1b2c3d4e5f6', 'ShellyWallDisplay-000000A1B2C3', 'neo_valve-1'])(
      'take the id "%s"',
      (id) => {
        expect(deviceIdProblem(id, 2)).toBeUndefined();
      },
    );
  });

  it.each([
    ['1', 1],
    ['99', 99],
    [' 48 ', 48],
    ['07', 7],
  ])('read the point "%s"', (text, point) => {
    expect(pointOf(text)).toBe(point);
    expect(pointProblem(text)).toBeUndefined();
  });

  it.each(['', '0', '100', '4.5', '-1', 'x', '1e1'])('refuse the point "%s"', (text) => {
    expect(pointOf(text)).toBeUndefined();
    expect(pointProblem(text)).toBe('devices.problem.point');
  });

  it('take a Bluetooth address however it is written, and nothing else', () => {
    expect(bluetoothAddressProblem('7c:c6:b6:00:00:01')).toBeUndefined();
    expect(bluetoothAddressProblem('7C-C6-B6-00-00-01')).toBeUndefined();
    expect(bluetoothAddressProblem('7c:c6:b6:00:00')).toBe('devices.problem.bluetoothAddress');
    expect(bluetoothAddressProblem('')).toBe('devices.problem.bluetoothAddress');
  });

  // the four unique indexes of the registry, with the words for which one
  describe('about a binding another device has', () => {
    it('find the channel of a Shelly taken by its address', () => {
      expect(
        bindingTaken({ shelly: { address: '192.0.2.22', generation: 2, channel: 0 } }, REGISTRY),
      ).toBe('devices.problem.shellyAddressTaken');
    });

    it('let another channel of the same Shelly be a device of its own', () => {
      expect(
        bindingTaken(
          {
            shelly: {
              address: '192.0.2.22',
              generation: 2,
              deviceId: 'shellyplus2pm-0a0b0c0d0e01',
              channel: 1,
            },
          },
          REGISTRY,
        ),
      ).toBeUndefined();
    });

    // a Shelly without a channel is one device as a whole, and is taken as a whole
    it('count a Shelly without a channel as one', () => {
      expect(bindingTaken({ shelly: { address: '192.0.2.40', generation: 2 } }, REGISTRY)).toBe(
        'devices.problem.shellyAddressTaken',
      );
      expect(
        bindingTaken({ shelly: { address: '192.0.2.40', generation: 2, channel: 0 } }, REGISTRY),
      ).toBeUndefined();
    });

    it('find the channel of a Shelly taken by its MQTT id, at another address', () => {
      expect(
        bindingTaken(
          {
            shelly: {
              address: '192.0.2.99',
              generation: 2,
              deviceId: 'shellyplus2pm-0a0b0c0d0e01',
              channel: 0,
            },
          },
          REGISTRY,
        ),
      ).toBe('devices.problem.shellyIdTaken');
    });

    it('find a point of an Eaton gateway taken, and the same point of the other gateway free', () => {
      expect(bindingTaken({ eaton: { gateway: 'blinds', point: 48 } }, REGISTRY)).toBe(
        'devices.problem.eatonPointTaken',
      );
      expect(bindingTaken({ eaton: { gateway: 'lights', point: 48 } }, REGISTRY)).toBeUndefined();
    });

    it('find a Bluetooth address taken', () => {
      expect(bindingTaken({ bthome: { address: '7c:c6:b6:00:00:01' } }, REGISTRY)).toBe(
        'devices.problem.bluetoothAddressTaken',
      );
      expect(bindingTaken({ bthome: { address: '7c:c6:b6:00:00:09' } }, REGISTRY)).toBeUndefined();
    });

    // the caller leaves the device being changed out of the others
    it('do not hold a device against itself', () => {
      const others = REGISTRY.filter((device) => device !== SHELLY);

      expect(bindingTaken({ shelly: SHELLY.shelly }, others)).toBeUndefined();
    });
  });

  describe('about a form nothing was changed in', () => {
    const details = {
      name: 'Office door blinds',
      room: 'office',
      kind: 'blinds',
      enabled: true,
      vendor: 'shelly',
      shelly: { ...SHELLY.shelly },
    };

    it('see the device of the registry in it', () => {
      expect(sameDevice(SHELLY, details)).toBe(true);
    });

    it.each([
      [{ name: 'Office blinds' }],
      [{ room: 'bedroom' }],
      [{ enabled: false }],
      [{ shelly: { ...SHELLY.shelly, channel: 1 } }],
      [{ shelly: undefined, eaton: { gateway: 'blinds', point: 3 }, vendor: 'eaton' }],
      [{ placement: 'external' }],
      [{ positioning: false }],
      [{ openingSensors: [9] }],
    ])('see the change %j', (change) => {
      expect(sameDevice(SHELLY, { ...details, ...change })).toBe(false);
    });

    // HAS-290: the order of the sensors is the registry's too
    it('see the opening sensors in their order', () => {
      const linked = { ...SHELLY, openingSensors: [9, 14] };
      expect(sameDevice(linked, { ...details, openingSensors: [9, 14] })).toBe(true);
      expect(sameDevice(linked, { ...details, openingSensors: [14, 9] })).toBe(false);
      expect(sameDevice(linked, details)).toBe(false);
    });
  });

  // HAS-341: the bounds of InverterBinding of smart-home-sdk 1.15.0
  describe('about an inverter', () => {
    it.each([
      ['MOCKX', undefined],
      [' MOCKX0000000001 ', undefined],
      ['A'.repeat(40), undefined],
      ['MOCK', 'devices.problem.serial'],
      ['A'.repeat(41), 'devices.problem.serial'],
      ['mockx00001', 'devices.problem.serial'],
      ['MOCK-00001', 'devices.problem.serial'],
      ['', 'devices.problem.serial'],
    ])('judges the serial "%s"', (serial, problem) => {
      expect(serialProblem(serial)).toBe(problem);
    });

    it('asks for nothing but the serial', () => {
      expect(batterySerialProblem('')).toBeUndefined();
      expect(batterySerialProblem('MOCK')).toBe('devices.problem.serial');
      expect(optionalAddressProblem('')).toBeUndefined();
      expect(optionalAddressProblem('192.0.2.64')).toBeUndefined();
      expect(optionalAddressProblem('dongle.local')).toBe('devices.problem.address');
      expect(registrationProblem('')).toBeUndefined();
      expect(loggerSerialProblem('')).toBeUndefined();
    });

    it.each([
      ['SMOCK', undefined],
      ['A'.repeat(20), undefined],
      ['SMOC', 'devices.problem.registration'],
      ['A'.repeat(21), 'devices.problem.registration'],
      ['smock00001', 'devices.problem.registration'],
    ])('judges the registration number "%s"', (registration, problem) => {
      expect(registrationProblem(registration)).toBe(problem);
    });

    it.each([
      ['1', 1],
      ['4294967295', 4_294_967_295],
      [' 1234567890 ', 1_234_567_890],
      ['0', undefined],
      ['4294967296', undefined],
      ['12.5', undefined],
      ['-1', undefined],
      ['12345678901', undefined],
    ])('reads the logger serial "%s"', (text, serial) => {
      expect(loggerSerialOf(text)).toBe(serial);
      expect(loggerSerialProblem(text)).toBe(
        serial === undefined ? 'devices.problem.loggerSerial' : undefined,
      );
    });

    it('finds a serial number another inverter has', () => {
      expect(
        bindingTaken({ inverter: { brand: 'sofar', serialNumber: 'MOCKX0000000001' } }, REGISTRY),
      ).toBe('devices.problem.serialTaken');
      expect(
        bindingTaken({ inverter: { brand: 'sofar', serialNumber: 'MOCKF0000000001' } }, REGISTRY),
      ).toBeUndefined();
    });

    it('tells a change of its binding from none', () => {
      const details = {
        name: 'SOLAX inverter',
        room: 'garage',
        kind: 'inverter',
        enabled: true,
        vendor: 'other',
        inverter: INVERTER.inverter,
      };
      const before = { ...INVERTER, ...details };
      expect(sameDevice(before, details)).toBe(true);
      expect(
        sameDevice(before, {
          ...details,
          inverter: { ...details.inverter, batterySerialNumber: 'MOCKB0000000001' },
        }),
      ).toBe(false);
    });
  });

  // HAS-290: the sensors of a window, read from an answer nothing checks
  describe('about the opening sensors of blinds', () => {
    it('reads the ids that are numbers and nothing else', () => {
      expect(
        openingSensorsOf({ openingSensors: [9, '14', null, 2.5, 14] as unknown as number[] }),
      ).toEqual([9, 14]);
      expect(openingSensorsOf({})).toEqual([]);
      expect(openingSensorsOf({ openingSensors: 'none' as unknown as number[] })).toEqual([]);
    });

    it('finds the blinds that name a sensor', () => {
      const all = [
        { id: 1, kind: 'blinds', openingSensors: [14] },
        { id: 2, kind: 'blinds', openingSensors: [9, 14] },
        { id: 3, kind: 'blinds' },
        { id: 4, kind: 'light', openingSensors: [14] },
      ];
      expect(blindsUsing(14, all).map((one) => one.id)).toEqual([1, 2]);
      expect(blindsUsing(5, all)).toEqual([]);
    });
  });
});
