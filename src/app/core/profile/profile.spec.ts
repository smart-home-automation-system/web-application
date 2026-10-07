import { HouseholdMember } from '../../data-access/household/household-api';
import { redirectFor } from './access';
import { Profile, parseProfile, sameName, sameProfile, toProfiles } from './profile';

describe('toProfiles', () => {
  it('turns the active members of the registry into profiles, in the order sent', () => {
    const members: HouseholdMember[] = [
      { name: 'Aurelia', active: true, role: 'admin', rooms: ['office', 'living room'] },
      { name: 'Borys', active: true, role: 'resident', rooms: ['loft'] },
    ];

    expect(toProfiles(members)).toEqual([
      { name: 'Aurelia', role: 'admin', rooms: ['office', 'living room'] },
      { name: 'Borys', role: 'resident', rooms: ['loft'] },
    ]);
  });

  it('reads a member without rooms as having none: the registry leaves the field out', () => {
    expect(toProfiles([{ name: 'Damian', active: true, role: 'resident' }])).toEqual([
      { name: 'Damian', role: 'resident', rooms: [] },
    ]);
  });

  it('leaves out a member who is switched off', () => {
    expect(toProfiles([{ name: 'Emil', active: false, role: 'admin' }])).toEqual([]);
  });

  // the role that reaches the least: a value this version does not know must not open everything
  it.each([undefined, 'owner', 'ADMIN', '', 7])('reads a role of %o as a resident', (role) => {
    const member = { name: 'Borys', active: true, role } as unknown as HouseholdMember;

    expect(toProfiles([member])[0].role).toBe('resident');
  });

  it('skips what is not a member, and rooms that are not names', () => {
    const answer = [
      null,
      'Aurelia',
      { active: true, role: 'admin' },
      { name: '  ', role: 'admin' },
      { name: 'Celina', rooms: ['bedroom', null, '', 4] },
    ] as unknown as HouseholdMember[];

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

  it('tells different names apart', () => {
    expect(sameName('Aurelia', 'Aurelian')).toBe(false);
    expect(sameName('Lucja', 'Łucja')).toBe(false);
  });
});

describe('sameProfile', () => {
  const borys: Profile = { name: 'Borys', role: 'resident', rooms: ['loft'] };

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
