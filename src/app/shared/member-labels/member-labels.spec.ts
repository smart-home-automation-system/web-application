import { permissionLabel, roleLabel } from './member-labels';

describe('the words for roles and permissions', () => {
  it('knows the roles and the permissions of the registry', () => {
    expect(roleLabel('admin')).toBe('profiles.role.admin');
    expect(roleLabel('resident')).toBe('profiles.role.resident');
    expect(permissionLabel('heating_switch')).toBe('household.permission.heatingSwitch');
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
