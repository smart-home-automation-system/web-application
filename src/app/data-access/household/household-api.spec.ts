import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ChangeOutcome, HouseholdApi, HouseholdMember, HouseholdRegistry } from './household-api';

const BORYS: HouseholdMember = {
  name: 'Borys',
  phone: '+48500100102',
  active: true,
  role: 'resident',
  rooms: ['loft'],
  devices: [{ name: 'Phone', mac: '02:00:00:00:b0:01' }],
};

const DETAILS = {
  name: 'Borys',
  phone: '+48500100102',
  role: 'resident',
  rooms: ['loft'],
  permissions: [] as string[],
};

describe('HouseholdApi, the registry', () => {
  let http: HttpTestingController;
  let registry: HouseholdRegistry;
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
      TestBed.inject(HouseholdApi).watchRegistry(afterChange),
    );
    answerTheRegistryWith([BORYS]);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  /** The read of the registry that is due now - the first one, or the one after a change. */
  function registryCall() {
    vi.advanceTimersByTime(1);
    return http.expectOne({ method: 'GET', url: '/home/household' });
  }

  function answerTheRegistryWith(members: readonly HouseholdMember[]): void {
    registryCall().flush(members);
  }

  /** Lets what waits for an answer go on: a few turns of the promise queue. */
  async function settled(): Promise<void> {
    for (let turn = 0; turn < 5; turn++) {
      await Promise.resolve();
    }
  }

  /** Answers every call of a change as it is made, in order, then the read after it. */
  async function carriedOut(
    change: Promise<ChangeOutcome>,
    calls: readonly { method: string; url: string }[],
  ): Promise<{ outcome: ChangeOutcome; bodies: unknown[] }> {
    const bodies: unknown[] = [];
    for (const call of calls) {
      await settled();
      const request = http.expectOne(call);
      bodies.push(request.request.body);
      request.flush({});
    }
    await settled();
    answerTheRegistryWith([BORYS]);
    return { outcome: await change, bodies };
  }

  it('reads the whole registry', () => {
    expect(registry.value()).toEqual([BORYS]);
    expect(registry.changing()).toBe(false);
  });

  it('adds a member with their role, rooms and permissions in one call', async () => {
    const { outcome, bodies } = await carriedOut(
      registry.add({ ...DETAILS, name: 'Fabian', permissions: ['heating_switch'] }),
      [{ method: 'POST', url: '/home/household/member' }],
    );

    expect(outcome).toEqual({ carriedOut: true });
    expect(bodies).toEqual([
      {
        name: 'Fabian',
        phone: '+48500100102',
        role: 'resident',
        rooms: ['loft'],
        permissions: ['heating_switch'],
      },
    ]);
  });

  describe('changing a member', () => {
    // every write of the registry stores the whole row: a call for nothing is a risk for nothing
    it('makes no call for a form nothing was changed in', async () => {
      const change = registry.update(BORYS, DETAILS);
      await settled();
      answerTheRegistryWith([BORYS]);

      expect(await change).toEqual({ carriedOut: true });
    });

    it('sends only the list that changed', async () => {
      const { bodies } = await carriedOut(
        registry.update(BORYS, { ...DETAILS, rooms: ['office', 'loft'] }),
        [{ method: 'PUT', url: '/home/household/member/Borys/rooms' }],
      );

      expect(bodies).toEqual([['office', 'loft']]);
    });

    it('counts another order of the rooms as a change', async () => {
      const before = { ...BORYS, rooms: ['loft', 'office'] };
      const { bodies } = await carriedOut(
        registry.update(before, { ...DETAILS, rooms: ['office', 'loft'] }),
        [{ method: 'PUT', url: '/home/household/member/Borys/rooms' }],
      );

      expect(bodies).toEqual([['office', 'loft']]);
    });

    // one after the other, and the name last: until then the member answers to the old one
    it('changes the rooms, the permissions and then the name, one call after the other', async () => {
      const change = registry.update(BORYS, {
        name: 'Bogdan',
        phone: '+48500100199',
        role: 'admin',
        rooms: [],
        permissions: ['heating_switch'],
      });
      await settled();

      const rooms = http.expectOne({ method: 'PUT', url: '/home/household/member/Borys/rooms' });
      http.expectNone('/home/household/member/Borys/permissions');
      rooms.flush({});
      await settled();

      const permissions = http.expectOne({
        method: 'PUT',
        url: '/home/household/member/Borys/permissions',
      });
      http.expectNone({ method: 'PATCH', url: '/home/household/member/Borys' });
      permissions.flush({});
      await settled();

      const details = http.expectOne({ method: 'PATCH', url: '/home/household/member/Borys' });
      details.flush({});
      await settled();
      answerTheRegistryWith([BORYS]);

      expect(await change).toEqual({ carriedOut: true });
      expect(rooms.request.body).toEqual([]);
      expect(permissions.request.body).toEqual(['heating_switch']);
      expect(details.request.body).toEqual({
        name: 'Bogdan',
        phone: '+48500100199',
        role: 'admin',
      });
    });

    // a role nobody chose is not sent: the registry keeps the one it has
    it('leaves the role out when none was chosen', async () => {
      const { bodies } = await carriedOut(
        registry.update(BORYS, { ...DETAILS, phone: '+48500100199', role: undefined }),
        [{ method: 'PATCH', url: '/home/household/member/Borys' }],
      );

      expect(bodies).toEqual([{ name: 'Borys', phone: '+48500100199' }]);
    });

    it('stops at the call that failed, and says why', async () => {
      const change = registry.update(BORYS, { ...DETAILS, name: 'Bogdan', rooms: [] });
      await settled();
      http.expectOne({ method: 'PUT', url: '/home/household/member/Borys/rooms' }).flush(
        {
          errors: [
            { message: 'Household member [Borys] not found', code: 'NOT_FOUND_HOUSEHOLD_MEMBER' },
          ],
        },
        { status: 404, statusText: 'Not Found' },
      );
      await settled();
      // the name was never sent
      http.expectNone({ method: 'PATCH', url: '/home/household/member/Borys' });
      answerTheRegistryWith([]);
      const outcome = await change;

      expect(outcome.carriedOut).toBe(false);
      expect(outcome.failure?.hasCode('NOT_FOUND_HOUSEHOLD_MEMBER')).toBe(true);
      expect(registry.value()).toEqual([]);
    });
  });

  it.each([
    [true, 'activate'],
    [false, 'deactivate'],
  ])('switches a member (active: %o) with the operation of its own', async (active, operation) => {
    const { outcome } = await carriedOut(registry.setActive('Borys', active), [
      { method: 'POST', url: `/home/household/member/Borys/${operation}` },
    ]);

    expect(outcome.carriedOut).toBe(true);
  });

  it('addresses a member by the name, encoded for a path', async () => {
    await carriedOut(registry.remove('Żaneta Łucja/x'), [
      {
        method: 'DELETE',
        url: '/home/household/member/%C5%BBaneta%20%C5%81ucja%2Fx',
      },
    ]);
  });

  it('adds, changes and removes a device, which is addressed by its MAC', async () => {
    const device = { name: 'Watch', mac: '02:00:00:00:b0:02' };

    const added = await carriedOut(registry.addDevice('Borys', device), [
      { method: 'POST', url: '/home/household/member/Borys/device' },
    ]);
    const changed = await carriedOut(registry.updateDevice('Borys', '02:00:00:00:b0:01', device), [
      { method: 'PATCH', url: '/home/household/member/Borys/device?mac=02:00:00:00:b0:01' },
    ]);
    await carriedOut(registry.removeDevice('Borys', '02:00:00:00:b0:01'), [
      { method: 'DELETE', url: '/home/household/member/Borys/device?mac=02:00:00:00:b0:01' },
    ]);

    expect(added.bodies).toEqual([device]);
    expect(changed.bodies).toEqual([device]);
  });

  describe('no optimistic state', () => {
    it('is changing until the registry was read again, and shows only that answer', async () => {
      const afterwards = [{ ...BORYS, active: false }];
      const change = registry.setActive('Borys', false);
      await settled();

      expect(registry.changing()).toBe(true);
      http.expectOne({ method: 'POST', url: '/home/household/member/Borys/deactivate' }).flush({});
      await settled();

      expect(registry.changing()).toBe(true);
      expect(registry.value()).toEqual([BORYS]);

      answerTheRegistryWith(afterwards);
      await change;

      expect(registry.changing()).toBe(false);
      expect(registry.value()).toEqual(afterwards);
    });

    // a change that got no answer may have been carried out: the registry says which
    it('reads the registry again after a change that got no answer', async () => {
      const change = registry.remove('Borys');
      await settled();
      http
        .expectOne({ method: 'DELETE', url: '/home/household/member/Borys' })
        .error(new ProgressEvent('error'));
      await settled();
      answerTheRegistryWith([]);
      const outcome = await change;

      expect(outcome.failure?.kind).toBe('network');
      expect(registry.value()).toEqual([]);
    });

    // every write stores the whole row: two for one member can undo each other
    it('refuses a second change while one is under way, without a call', async () => {
      const first = registry.setActive('Borys', false);
      await settled();

      expect(await registry.setActive('Borys', true)).toEqual({ carriedOut: false });

      http.expectOne({ method: 'POST', url: '/home/household/member/Borys/deactivate' }).flush({});
      await settled();
      answerTheRegistryWith([BORYS]);
      await first;
      // one change was made, and one is followed up
      expect(afterChange).toHaveBeenCalledTimes(1);
    });
  });

  // whatever has to follow every change - the page asks for the profiles
  describe('what follows a change', () => {
    it('is called once the registry was read again, not before', async () => {
      const change = registry.setActive('Borys', false);
      await settled();
      http.expectOne({ method: 'POST', url: '/home/household/member/Borys/deactivate' }).flush({});
      await settled();
      expect(afterChange).not.toHaveBeenCalled();

      answerTheRegistryWith([BORYS]);
      await change;

      expect(afterChange).toHaveBeenCalledTimes(1);
    });

    // a change that got no answer may have been carried out
    it('is called after a change that failed, too', async () => {
      const change = registry.remove('Borys');
      await settled();
      http
        .expectOne({ method: 'DELETE', url: '/home/household/member/Borys' })
        .error(new ProgressEvent('error'));
      await settled();
      answerTheRegistryWith([BORYS]);
      await change;

      expect(afterChange).toHaveBeenCalledTimes(1);
    });
  });
});
