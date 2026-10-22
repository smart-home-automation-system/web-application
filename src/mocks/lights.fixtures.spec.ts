import {
  lightRules,
  lightsByRoom,
  removeRule,
  replaceRule,
  resetLights,
  setColor,
  turnLight,
  turnRoom,
} from './lights.fixtures';

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

  // HAS-267: the rules are written whole and refused as light-service refuses them
  describe('the rules', () => {
    const KITCHEN_RULE = {
      autoOffEnabled: false,
      motionOnEnabled: false,
      periods: [],
      manualHoldMinutes: 20,
    };

    it('starts with rules every room of them can have', () => {
      for (const rule of lightRules()) {
        // the rule as the administrator writes it: without what the service adds
        const added = ['room', 'enabledByResident', 'updatedAt'];
        const body = Object.fromEntries(
          Object.entries(rule).filter(([field]) => !added.includes(field)),
        );
        expect(replaceRule(rule.room!, body).status).toBe(200);
      }
    });

    it('writes a rule whole and keeps the switch of the resident', () => {
      const answer = replaceRule('living room', {
        autoOffEnabled: false,
        motionOnEnabled: true,
        motionOffAfterMinutes: 4,
        periods: [
          { from: '22:00', to: '06:00', brightness: 10, rgb: [255, 120, 0] },
          { from: '18:00', to: '22:00' },
        ],
        manualHoldMinutes: 15,
      });

      expect(answer.status).toBe(200);
      const stored = lightRules().find((rule) => rule.room === 'living room');
      expect(stored?.enabledByResident).toBe(false);
      expect(stored?.autoOffDelayMinutes).toBeUndefined();
      // by the start of each period, as the service orders them
      expect(stored?.periods?.map((period) => period.from)).toEqual(['18:00', '22:00']);
    });

    it('refuses with INVALID_RULE what the body or the room breaks', () => {
      const refused = (answer: { status: number; body: unknown }) => [
        answer.status,
        (answer.body as { errors: { code: string }[] }).errors[0].code,
      ];
      expect(refused(replaceRule('office', { ...KITCHEN_RULE, manualHoldMinutes: 0 }))).toEqual([
        400,
        'INVALID_RULE',
      ]);
      // the kitchen has no light in the mock registry
      expect(refused(replaceRule('kitchen', KITCHEN_RULE))).toEqual([400, 'INVALID_RULE']);
      // the hall down is on an Eaton PIR only
      expect(refused(replaceRule('hall down', KITCHEN_RULE))).toEqual([400, 'INVALID_RULE']);
      expect(replaceRule('nowhere', KITCHEN_RULE).status).toBe(400);
    });

    it('removes a rule, and answers 404 for a room without one', () => {
      expect(removeRule('office').status).toBe(204);
      expect(lightRules().some((rule) => rule.room === 'office')).toBe(false);
      expect(removeRule('office').status).toBe(404);
    });
  });
});
