import { RoomBlinds } from '../../data-access/blinds/blinds-api';
import { RegisteredDevice } from '../../data-access/devices/device-registry-api';
import { toRoomViews } from '../../shared/room-heating/room-views';
import { blindPositionLabel } from '../../shared/blinds/blind-position';
import { shortName } from '../../shared/device-names/device-names';
import { shortWindowLabel } from './room-labels';
import { dims, lightState, rowOf, toRoomOverview } from './room-overview';

const device = (
  id: number,
  kind: string,
  extra: Partial<RegisteredDevice> = {},
): RegisteredDevice => ({
  id,
  name: `Device ${id}`,
  room: 'office',
  kind,
  enabled: true,
  ...extra,
});

const DEVICES: readonly RegisteredDevice[] = [
  device(1, 'blinds', { positioning: true }),
  device(2, 'light', { vendor: 'eaton', eaton: { gateway: 'lights', point: 12 } }),
  device(3, 'motion sensor'),
  device(4, 'opening sensor'),
  device(5, 'temperature sensor'),
  device(6, 'push button'),
  device(7, 'a kind of a later version'),
  // switched off: no service uses it
  device(8, 'light', { enabled: false }),
  device(9, 'blinds', { room: 'bedroom' }),
];

// HAS-232: what the three services say of one room, put together by the rows of the owner
describe('toRoomOverview', () => {
  it('puts every switched-on device of the room into its row, an unknown kind into other', () => {
    const office = toRoomOverview('office', DEVICES, undefined, undefined);

    expect(office.blinds.map((row) => row.device.id)).toEqual([1]);
    expect(office.lights.map((one) => one.device.id)).toEqual([2]);
    expect(office.motion.map((one) => one.id)).toEqual([3]);
    expect(office.openingSensors.map((one) => one.id)).toEqual([4]);
    expect(office.temperatureSensors.map((one) => one.id)).toEqual([5]);
    expect(office.other.map((one) => one.id)).toEqual([6, 7]);
    expect(rowOf(device(10, 'weather station'))).toBe('other');
  });

  // HAS-292: the state of a light is light-service's; what it does not say is not known, never off
  it('joins a light with what the light service says of it - or with nothing', () => {
    const answered = toRoomOverview('office', DEVICES, undefined, undefined, [
      { room: 'office', lights: [{ id: 2, kind: 'dimmer', on: false, brightness: 30 }] },
    ]);
    const [light] = answered.lights;
    expect(lightState(light)).toBe('off');
    expect(light.unknownToService).toBe(false);
    expect(dims(light)).toBe(true);

    // the service answered without it: it skips a light it cannot drive
    const [skipped] = toRoomOverview('office', DEVICES, undefined, undefined, []).lights;
    expect(skipped.unknownToService).toBe(true);
    expect(lightState(skipped)).toBe('unknown');

    // no answer at all: nothing is known, and nothing is said against it
    const [silent] = toRoomOverview('office', DEVICES, undefined, undefined, undefined).lights;
    expect(silent.unknownToService).toBe(false);
    expect(lightState(silent)).toBe('unknown');
    expect(dims(silent)).toBe(false);
  });

  it('joins a blind with what the blinds service says of it - or with nothing', () => {
    const blinds: RoomBlinds[] = [
      {
        room: 'office',
        blinds: [
          { id: 1, position: 40, window: 'open', schedulePausedSince: '2026-10-17T20:15:00' },
        ],
      },
    ];

    const [row] = toRoomOverview('office', DEVICES, undefined, blinds).blinds;
    expect(row.state?.position).toBe(40);
    expect(row.window).toEqual({ state: 'open', openSince: undefined, hold: undefined });
    expect(blindPositionLabel(row)).toEqual({ key: 'blindControl.position', position: 40 });

    const [unknown] = toRoomOverview('office', DEVICES, undefined, null).blinds;
    expect(unknown.state).toBeUndefined();
    expect(blindPositionLabel(unknown)).toEqual({ key: 'blindControl.state.unknown' });
  });

  // a state the service sends without a position: never read as closed
  it('says what a blind does where it reports no position', () => {
    expect(blindPositionLabel({ device: DEVICES[0], state: { id: 1, state: 'closing' } })).toEqual({
      key: 'blindControl.state.closing',
    });
  });

  // owner, 2026-10-18: the door first, then the windows by name
  it('puts the door of a room before its windows', () => {
    const bedroom: RegisteredDevice[] = [
      device(57, 'blinds', { name: 'Bedroom window second', room: 'bedroom' }),
      device(55, 'blinds', { name: 'Bedroom window main', room: 'bedroom' }),
      device(56, 'blinds', { name: 'Bedroom door', room: 'bedroom' }),
    ];

    expect(
      toRoomOverview('bedroom', bedroom, undefined, undefined).blinds.map((row) => row.device.name),
    ).toEqual(['Bedroom door', 'Bedroom window main', 'Bedroom window second']);
  });

  // owner, 2026-10-18: the window names the room and the section names the kind
  it('names a device without its room and its kind', () => {
    expect(shortName('Office door blinds', 'office', 'blinds')).toBe('Door');
    expect(shortName('Living room terrace blinds', 'living room', 'blinds')).toBe('Terrace');
    expect(shortName('Bedroom window main', 'bedroom', 'blinds')).toBe('Window main');
    expect(shortName('Office main light', 'office', 'light')).toBe('Main');
    // nothing but the room and the kind: the name stays whole
    expect(shortName('Office blinds', 'office', 'blinds')).toBe('Office blinds');
    expect(shortName('Kitchen window', 'office', 'blinds')).toBe('Kitchen window');
    expect(shortName(undefined, 'office', 'blinds')).toBeUndefined();
  });

  it('takes the room of the heating with its windows', () => {
    const heating = toRoomViews([
      {
        name: 'office',
        temperature: { value: 21.3, updatedAt: '2026-10-17T20:00:00' },
        window: { state: 'open', openSince: '2026-10-17T19:50:00', hold: true },
      },
    ]);

    const office = toRoomOverview('office', DEVICES, heating, undefined);
    expect(office.heating?.temperature).toBe(21.3);
    expect(office.heating?.window).toEqual({
      state: 'open',
      openSince: '2026-10-17T19:50:00',
      hold: true,
    });
    expect(toRoomOverview('kitchen', DEVICES, heating, undefined).heating).toBeUndefined();
  });

  // a state this version does not know is not known - never closed
  it('reads a window state it does not know as unknown', () => {
    const [room] = toRoomViews([{ name: 'office', window: { state: 'ajar' } }]);
    expect(room.window?.state).toBe('unknown');
    expect(shortWindowLabel('unknown')).toBe('rooms.window.unknown');
    expect(toRoomViews([{ name: 'office' }])[0].window).toBeUndefined();
  });
});
