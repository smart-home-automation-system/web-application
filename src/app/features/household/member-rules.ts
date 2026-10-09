import { AbstractControl, ValidatorFn } from '@angular/forms';

import { MessageKey } from '../../i18n/messages';

/**
 * What the registry accepts of a member and a device, checked before anything is sent - a copy
 * of the bounds of `smart-home-sdk` (`HouseholdMember`, `MemberPhoneDetails`) and of the unique
 * constraints of `database-service`. Each rule answers the key of the sentence that says what
 * is wrong, or `undefined`.
 *
 * The registry checks all of it again; these rules only save the round trip, and say *which*
 * of two things clashed where the registry has one code for both.
 */
export const NAME_MIN_LENGTH = 3;
export const NAME_MAX_LENGTH = 50;
export const DEVICE_NAME_MAX_LENGTH = 50;

const PHONE = /^\+[1-9][0-9]{7,14}$/;
const MAC = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/;

/** A name as it is sent: without the spaces around it. */
export function normaliseName(text: string): string {
  return text.trim();
}

/**
 * A phone number as it is sent: E.164 has no spaces, dashes or brackets, and people write all
 * three (`+48 500 100-200`).
 */
export function normalisePhone(text: string): string {
  return text.replace(/[\s\-()]/g, '');
}

/**
 * A MAC address as it is sent: lowercase and colon separated. Some tools print it in capitals
 * or with dashes - the same address, so it is rewritten instead of refused.
 */
export function normaliseMac(text: string): string {
  return text.trim().toLowerCase().replaceAll('-', ':');
}

/** `others`: the names of the other members - names are unique whatever their case. */
export function nameProblem(text: string, others: readonly string[]): MessageKey | undefined {
  const name = normaliseName(text);
  if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) {
    return 'household.problem.nameLength';
  }
  return others.some((other) => other.toLowerCase() === name.toLowerCase())
    ? 'household.problem.nameTaken'
    : undefined;
}

export function phoneProblem(text: string, others: readonly string[]): MessageKey | undefined {
  const phone = normalisePhone(text);
  if (!PHONE.test(phone)) {
    return 'household.problem.phoneFormat';
  }
  return others.includes(phone) ? 'household.problem.phoneTaken' : undefined;
}

/** `others`: the names of the member's other devices. */
export function deviceNameProblem(text: string, others: readonly string[]): MessageKey | undefined {
  const name = normaliseName(text);
  if (name === '' || name.length > DEVICE_NAME_MAX_LENGTH) {
    return 'household.problem.deviceName';
  }
  return others.includes(name) ? 'household.problem.deviceNameTaken' : undefined;
}

/** `others`: the addresses of every other device in the registry, whoever has it. */
export function macProblem(text: string, others: readonly string[]): MessageKey | undefined {
  const mac = normaliseMac(text);
  if (!MAC.test(mac)) {
    return 'household.problem.macFormat';
  }
  return others.includes(mac) ? 'household.problem.macTaken' : undefined;
}

/**
 * A rule as the validator of a form control. `others` is read at every check, so the rule
 * follows a registry that changed while the form was open.
 */
export function rule(
  problem: (text: string, others: readonly string[]) => MessageKey | undefined,
  others: () => readonly string[],
): ValidatorFn {
  return (control: AbstractControl<string>) => {
    const found = problem(control.value, others());
    return found === undefined ? null : { problem: found };
  };
}

/** The sentence for what is wrong with a control somebody has been in - or `undefined`. */
export function problemOf(control: AbstractControl): MessageKey | undefined {
  return control.touched || control.dirty
    ? (control.errors?.['problem'] as MessageKey | undefined)
    : undefined;
}
