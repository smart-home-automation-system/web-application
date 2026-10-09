import { MEMBER_PERMISSIONS, MEMBER_ROLES } from '../../data-access/household/registry-values';
import { PERMISSION_LABELS, ROLE_LABELS, permissionLabel, roleLabel } from './member-labels';

describe('the words for roles and permissions', () => {
  it('knows the roles and the permissions of the registry', () => {
    expect(roleLabel('admin')).toBe('profiles.role.admin');
    expect(roleLabel('resident')).toBe('profiles.role.resident');
    expect(permissionLabel('heating_switch')).toBe('household.permission.heatingSwitch');
  });

  // The compiler makes sure every role and permission has a word; nothing makes sure the form
  // offers it. A value added to the type and not to the offered list fails here.
  it('has a word for exactly what the administration offers', () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...MEMBER_ROLES].sort());
    expect(Object.keys(PERMISSION_LABELS).sort()).toEqual([...MEMBER_PERMISSIONS].sort());
  });

  // the caller then prints the value as the registry sent it
  it.each(['owner', '', 'ADMIN'])('has no word for the unknown value %o', (value) => {
    expect(roleLabel(value)).toBeUndefined();
    expect(permissionLabel(value)).toBeUndefined();
  });

  // a value from outside must not find what every object inherits
  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'does not mistake %o for a role or a permission',
    (value) => {
      expect(roleLabel(value)).toBeUndefined();
      expect(permissionLabel(value)).toBeUndefined();
    },
  );
});
