import { MemberPermission, MemberRole } from '../../core/profile/profile';
import { MessageKey } from '../../i18n/messages';

/**
 * The words for the roles and the permissions of the household registry - one list for every
 * view that names them (the profile picker, the administration). A value added to
 * `smart-home-sdk` gets its type in `core/profile/profile.ts` and its text here, once: the
 * records are typed by the values, so one without a text does not compile.
 */
export const ROLE_LABELS: Readonly<Record<MemberRole, MessageKey>> = {
  admin: 'profiles.role.admin',
  resident: 'profiles.role.resident',
};

export const PERMISSION_LABELS: Readonly<Record<MemberPermission, MessageKey>> = {
  heating_switch: 'household.permission.heatingSwitch',
};

/**
 * The key of the text for a role as the registry sent it, or `undefined` for one this version
 * does not know - the caller then prints the value as it came. (`Object.hasOwn`: the value
 * comes from outside, and "constructor" must not find something on a plain object.)
 */
export function roleLabel(role: string): MessageKey | undefined {
  return Object.hasOwn(ROLE_LABELS, role) ? ROLE_LABELS[role as MemberRole] : undefined;
}

/** The key of the text for a permission, or `undefined` for one this version does not know. */
export function permissionLabel(permission: string): MessageKey | undefined {
  return Object.hasOwn(PERMISSION_LABELS, permission)
    ? PERMISSION_LABELS[permission as MemberPermission]
    : undefined;
}
