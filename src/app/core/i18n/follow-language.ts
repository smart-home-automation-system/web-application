import { Signal, effect } from '@angular/core';

/**
 * Angular Material ships its own texts - "Items per page", "Next month" - in English, outside
 * the templates of this application. The classes that replace the holders of those texts
 * (`material-intl.ts` for the paginator, `calendar.ts` for the calendar) follow the language of
 * the interface with this.
 *
 * The labels are set while the object is built, so a control created in Polish is Polish from
 * its first render; on a later change of language they are set again and a control already on
 * screen is told to re-read them through `changed`.
 */
export function followLanguage(
  language: Signal<unknown>,
  apply: () => void,
  changed: () => void,
): void {
  apply();
  let built = false;
  effect(() => {
    language();
    // the first run only registers the dependency: the labels were just set
    if (built) {
      apply();
      changed();
    }
    built = true;
  });
}
