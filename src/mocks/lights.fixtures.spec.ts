import { lightsByRoom, resetLights, setColor, turnLight, turnRoom } from './lights.fixtures';

const lightOf = (id: number) =>
  lightsByRoom()
    .flatMap((room) => room.lights ?? [])
    .find((light) => light.id === id);

// HAS-266: the mock light-service refuses what the service refuses, and a room names what it could not switch
describe('mock lights', () => {
  afterEach(() => resetLights());

  it('takes a colour for an rgbw light, white only from one that has a white channel', () => {
    expect(setColor('41', { rgb: [10, 20, 30], white: 5 }, 'dashboard').status).toBe(202);
    expect(lightOf(41)?.color).toEqual({ rgb: [10, 20, 30], white: 5 });
    expect(lightOf(41)?.on).toBe(true);

    // the profile rgb: no white
    expect(setColor('44', { white: 5 }, 'dashboard')).toEqual({
      status: 400,
      body: {
        errors: [{ message: 'Light [44] cannot take this color', code: 'UNSUPPORTED_CAPABILITY' }],
      },
    });
    expect(setColor('3', { rgb: [1, 2, 3] }, 'dashboard').status).toBe(400);
    expect(setColor('41', { rgb: [256, 0, 0] }, 'dashboard').status).toBe(400);
    expect(setColor('41', {}, 'dashboard').status).toBe(400);
  });

  it('refuses a command to a light it cannot reach', () => {
    expect(turnLight('43', 'on', 'dashboard').status).toBe(502);
  });

  it('switches a room light by light, naming the one it could not reach', () => {
    const reply = turnRoom('kitchen', 'on', 'dashboard');

    expect(reply.status).toBe(202);
    expect(reply.body).toEqual({
      room: 'kitchen',
      turn: 'on',
      switched: [{ id: 44, name: 'Kitchen hood light' }],
      failed: [{ id: 43, name: 'Kitchen counter light', code: 'DEVICE_FAILED' }],
    });
    expect(lightOf(44)?.on).toBe(true);
    expect(turnRoom('garage', 'off', 'dashboard').status).toBe(404);
  });

  it('knows the occupancy of nobody just after a start', () => {
    expect(lightsByRoom(true).every((room) => room.occupancy?.occupied === undefined)).toBe(true);
    expect(lightsByRoom().find((room) => room.room === 'office')?.occupancy?.occupied).toBe(true);
  });
});
