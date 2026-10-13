import { AbstractControl, ValidatorFn } from '@angular/forms';

import { MessageKey } from '../../i18n/messages';

/**
 * What the forms of the registries share: a rule answers the key of the sentence that says
 * what is wrong with a text, or `undefined`, and a form control carries that key as its error.
 */
export type TextRule = (text: string) => MessageKey | undefined;

const MAC = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/;

/**
 * A MAC address as it is sent: lowercase and colon separated. Some tools print it in capitals
 * or with dashes - the same address, so it is rewritten instead of refused.
 */
export function normaliseMac(text: string): string {
  return text.trim().toLowerCase().replaceAll('-', ':');
}

/** Six pairs of hexadecimal digits, lowercase, separated by colons. */
export function isMac(text: string): boolean {
  return MAC.test(text);
}

/**
 * A rule as the validator of a form control. What a rule reads besides the text - a registry -
 * is read at every check, but a control is checked when its value changes, not when the
 * registry does: a form calls `updateValueAndValidity()` on its controls before it sends, so
 * that what it sends was checked against the registry as it is then.
 */
export function validator(problem: TextRule): ValidatorFn {
  return (control: AbstractControl<string>) => {
    const found = problem(control.value);
    return found === undefined ? null : { problem: found };
  };
}

/** The sentence for what is wrong with a control somebody has been in - or `undefined`. */
export function problemOf(control: AbstractControl): MessageKey | undefined {
  return control.touched || control.dirty
    ? (control.errors?.['problem'] as MessageKey | undefined)
    : undefined;
}
