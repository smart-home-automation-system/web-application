import { HouseholdProfile } from '../../data-access/household/household-api';
import { redirectFor } from './access';
import { Profile, hasPermission, parseProfile, sameName, sameProfile, toProfiles } from './profile';

describe('toProfiles', () => {
  it('turns the answer of the registry into profiles, in the order sent', () => {
    const members: HouseholdProfile[] = [
      { name: 'Aurelia', role: 'admin', rooms: ['office', 'living room'] },
      { name: 'Borys', role: 'resident', rooms: ['loft'] },
    ];

    expect(toProfiles(members)).toEqual([
      { name: 'Aurelia', role: 'admin', rooms: ['office', 'living room'] },
      { name: 'Borys', role: 'resident', rooms: ['loft'] },
    ]);
  });

  it('reads a member without rooms as having none: the registry leaves the field out', () => {
    expect(toProfiles([{ name: 'Damian', role: 'resident' }])).toEqual([
      { name: 'Damian', role: 'resident', rooms: [] },
    ]);
  });

  // not part of the answer - but if the full registry ever answered under this address, the
  // members it marks as switched off must not get a profile back
  it('leaves out an entry that says it is not active, and takes one that says nothing', () => {
    const answer = [
      { name: 'Emil', active: false, role: 'admin' },
      { name: 'Borys', active: true, role: 'resident' },
      { name: 'Celina', role: 'resident' },
    ];

    expect(toProfiles(answer).map((profile) => profile.name)).toEqual(['Borys', 'Celina']);
  });

  // the role that reaches the least: a value this version does not know must not open everything
  it.each([undefined, 'owner', 'ADMIN', '', 7])('reads a role of %o as a resident', (role) => {
    const member = { name: 'Borys', role } as unknown as HouseholdProfile;

    expect(toProfiles([member])[0].role).toBe('resident');
  });

  it('skips what is not a member, and rooms that are not names', () => {
    const answer = [
      null,
      'Aurelia',
      { role: 'admin' },
      { name: '  ', role: 'admin' },
      { name: 7, role: 'admin' },
      { name: 'Celina', rooms: ['bedroom', null, '', 4] },
    ] as unknown as HouseholdProfile[];

    expect(toProfiles(answer)).toEqual([{ name: 'Celina', role: 'resident', rooms: ['bedroom'] }]);
  });
});

describe('parseProfile', () => {
  it('reads back a profile kept in the browser', () => {
    expect(parseProfile({ name: 'Borys', role: 'resident', rooms: ['loft'] })).toEqual({
      name: 'Borys',
      role: 'resident',
      rooms: ['loft'],
    });
  });

  it.each([
    null,
    'Borys',
    [],
    { role: 'admin' },
    { name: '', role: 'admin' },
    { name: 'Borys' },
    { name: 'Borys', role: 'owner' },
  ])('answers nobody for %o', (stored) => {
    expect(parseProfile(stored)).toBeUndefined();
  });
});

describe('sameName', () => {
  it('matches a name typed in another case, or with spaces around it', () => {
    expect(sameName('Aurelia', 'aurelia')).toBe(true);
    expect(sameName('Łucja', ' łucja ')).toBe(true);
  });

  // "I".toLocaleLowerCase() is a dotless "ı" in a Turkish browser
  it('does not depend on the language of the browser', () => {
    const lower = vi.spyOn(String.prototype, 'toLocaleLowerCase');

    expect(sameName('Iga', 'iga')).toBe(true);
    expect(lower).not.toHaveBeenCalled();
    lower.mockRestore();
  });

  it('tells different names apart', () => {
    expect(sameName('Aurelia', 'Aurelian')).toBe(false);
    expect(sameName('Lucja', 'Łucja')).toBe(false);
  });
});

describe('permissions', () => {
  it('reads what the registry granted a member, each permission once', () => {
    expect(
      toProfiles([
        { name: 'Celina', role: 'resident', permissions: ['heating_switch', 'heating_switch'] },
        { name: 'Borys', role: 'resident', permissions: [] },
        { name: 'Damian', role: 'resident' },
        { name: 'Aurelia', role: 'admin', permissions: 'heating_switch' },
        { name: 'Emil', role: 'resident', permissions: [null, 4, '', 'something new'] },
      ]),
    ).toEqual([
      { name: 'Celina', role: 'resident', rooms: [], permissions: ['heating_switch'] },
      { name: 'Borys', role: 'resident', rooms: [] },
      { name: 'Damian', role: 'resident', rooms: [] },
      { name: 'Aurelia', role: 'admin', rooms: [] },
      // a permission this version does not know is carried along; it opens nothing
      { name: 'Emil', role: 'resident', rooms: [], permissions: ['something new'] },
    ]);
  });

  it('leaves the field out of a profile nothing was granted to', () => {
    const [borys] = toProfiles([{ name: 'Borys', role: 'resident', permissions: [] }]);

    expect('permissions' in borys).toBe(false);
  });

  it('remembers them with the profile kept in the browser', () => {
    expect(
      parseProfile({
        name: 'Celina',
        role: 'resident',
        rooms: [],
        permissions: ['heating_switch'],
      }),
    ).toEqual({ name: 'Celina', role: 'resident', rooms: [], permissions: ['heating_switch'] });
    // a profile remembered by a version without permissions has none
    expect(parseProfile({ name: 'Borys', role: 'resident', rooms: ['loft'] })).toEqual({
      name: 'Borys',
      role: 'resident',
      rooms: ['loft'],
    });
  });

  it('answers whether a member may do something, and no for everything else', () => {
    const celina: Profile = {
      name: 'Celina',
      role: 'resident',
      rooms: [],
      permissions: ['heating_switch'],
    };

    expect(hasPermission(celina, 'heating_switch')).toBe(true);
    expect(hasPermission({ ...celina, permissions: ['something new'] }, 'heating_switch')).toBe(
      false,
    );
    expect(hasPermission({ ...celina, permissions: [] }, 'heating_switch')).toBe(false);
    expect(hasPermission({ name: 'Borys', role: 'resident', rooms: [] }, 'heating_switch')).toBe(
      false,
    );
    // not the role: an administrator nobody granted it to has none
    expect(hasPermission({ name: 'Aurelia', role: 'admin', rooms: [] }, 'heating_switch')).toBe(
      false,
    );
    expect(hasPermission(undefined, 'heating_switch')).toBe(false);
  });
});

describe('sameProfile', () => {
  const borys: Profile = { name: 'Borys', role: 'resident', rooms: ['loft'] };

  it('compares what the registry granted, whatever the order it is listed in', () => {
    const granted: Profile = { ...borys, permissions: ['heating_switch', 'another'] };

    expect(sameProfile(granted, { ...borys, permissions: ['another', 'heating_switch'] })).toBe(
      true,
    );
    // a grant and a withdrawal both replace the profile the browser remembers
    expect(sameProfile(borys, granted)).toBe(false);
    expect(sameProfile(granted, borys)).toBe(false);
    expect(sameProfile(granted, { ...borys, permissions: ['heating_switch'] })).toBe(false);
    // nothing granted is nothing granted, said either way
    expect(sameProfile(borys, { ...borys, permissions: [] })).toBe(true);
  });

  it('compares the name, the role and the rooms in their order', () => {
    expect(sameProfile(borys, { ...borys, rooms: ['loft'] })).toBe(true);
    expect(sameProfile(borys, { ...borys, role: 'admin' })).toBe(false);
    expect(sameProfile(borys, { ...borys, rooms: ['loft', 'office'] })).toBe(false);
    expect(sameProfile(borys, undefined)).toBe(false);
    expect(sameProfile(undefined, undefined)).toBe(true);
  });
});

describe('redirectFor', () => {
  const admin: Profile = { name: 'Aurelia', role: 'admin', rooms: [] };
  const resident: Profile = { name: 'Borys', role: 'resident', rooms: [] };

  it('opens everything to the administrator', () => {
    for (const access of ['anyone', 'chooser', 'member', 'admin'] as const) {
      expect(redirectFor(access, admin)).toBeUndefined();
    }
  });

  it('opens to a resident their own page and what is open to anyone', () => {
    expect(redirectFor('member', resident)).toBeUndefined();
    expect(redirectFor('anyone', resident)).toBeUndefined();
  });

  it('sends a resident to their room from everything else, the picker included', () => {
    expect(redirectFor('admin', resident)).toBe('/room');
    expect(redirectFor('chooser', resident)).toBe('/room');
  });

  it('sends somebody without a profile to the picker', () => {
    expect(redirectFor('admin', undefined)).toBe('/profiles');
    expect(redirectFor('member', undefined)).toBe('/profiles');
    expect(redirectFor('chooser', undefined)).toBeUndefined();
    expect(redirectFor('anyone', undefined)).toBeUndefined();
  });
});
