import { RoomBlinds } from '../../data-access/blinds/blinds-api';
import { RegisteredDevice } from '../../data-access/devices/device-registry-api';
import { Profile } from '../../core/profile/profile';
import { toRoomViews } from '../../shared/room-heating/room-views';
import { blindPositionLabel, shortWindowLabel } from './room-labels';
import { rowOf, toRoomOverview } from './room-overview';

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

const MEMBERS: readonly Profile[] = [
  { name: 'Aurelia', role: 'admin', rooms: ['office'] },
  { name: 'Borys', role: 'resident', rooms: ['office', 'bedroom'] },
  { name: 'Cezary', role: 'resident', rooms: ['bedroom'] },
];

// HAS-232: what the four services say of one room, put together by the rows of the owner
describe('toRoomOverview', () => {
  it('puts every switched-on device of the room into its row, an unknown kind into other', () => {
    const office = toRoomOverview('office', DEVICES, undefined, undefined, undefined, undefined);

    expect(office.blinds.map((row) => row.device.id)).toEqual([1]);
    expect(office.lights.map((one) => one.id)).toEqual([2]);
    expect(office.motion.map((one) => one.id)).toEqual([3]);
    expect(office.openingSensors.map((one) => one.id)).toEqual([4]);
    expect(office.temperatureSensors.map((one) => one.id)).toEqual([5]);
    expect(office.other.map((one) => one.id)).toEqual([6, 7]);
    expect(rowOf(device(10, 'weather station'))).toBe('other');
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

    const [row] = toRoomOverview('office', DEVICES, undefined, blinds, undefined, undefined).blinds;
    expect(row.state?.position).toBe(40);
    expect(row.window).toEqual({ state: 'open', openSince: undefined, hold: undefined });
    expect(blindPositionLabel(row)).toEqual({ key: 'rooms.blinds.position', position: 40 });

    const [unknown] = toRoomOverview(
      'office',
      DEVICES,
      undefined,
      null,
      undefined,
      undefined,
    ).blinds;
    expect(unknown.state).toBeUndefined();
    expect(blindPositionLabel(unknown)).toEqual({ key: 'rooms.blinds.state.unknown' });
  });

  // a state the service sends without a position: never read as closed
  it('says what a blind does where it reports no position', () => {
    expect(blindPositionLabel({ device: DEVICES[0], state: { id: 1, state: 'closing' } })).toEqual({
      key: 'rooms.blinds.state.closing',
    });
  });

  it('lists the residents of the room with whether they are at home - unknown when not said', () => {
    const office = toRoomOverview('office', DEVICES, undefined, undefined, MEMBERS, [
      { name: 'aurelia', present: true },
    ]);

    expect(office.residents).toEqual([
      { name: 'Aurelia', present: true },
      { name: 'Borys', present: undefined },
    ]);
  });

  it('takes the room of the heating with its windows', () => {
    const heating = toRoomViews([
      {
        name: 'office',
        temperature: { value: 21.3, updatedAt: '2026-10-17T20:00:00' },
        window: { state: 'open', openSince: '2026-10-17T19:50:00', hold: true },
      },
    ]);

    const office = toRoomOverview('office', DEVICES, heating, undefined, undefined, undefined);
    expect(office.heating?.temperature).toBe(21.3);
    expect(office.heating?.window).toEqual({
      state: 'open',
      openSince: '2026-10-17T19:50:00',
      hold: true,
    });
    expect(
      toRoomOverview('kitchen', DEVICES, heating, undefined, undefined, undefined).heating,
    ).toBeUndefined();
  });

  // a state this version does not know is not known - never closed
  it('reads a window state it does not know as unknown', () => {
    const [room] = toRoomViews([{ name: 'office', window: { state: 'ajar' } }]);
    expect(room.window?.state).toBe('unknown');
    expect(shortWindowLabel('unknown')).toBe('rooms.window.unknown');
    expect(toRoomViews([{ name: 'office' }])[0].window).toBeUndefined();
  });
});
