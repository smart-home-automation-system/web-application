import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject } from '@angular/core';

/**
 * What the application remembers in the browser - the language, the theme, the photos, the
 * profile - goes through these functions, so every store treats the storage the same way:
 *
 * - **It can be unavailable** (private mode, blocked site data) and then throws on every access.
 *   Nothing here throws: a read answers `undefined`, a write does nothing, and what was chosen
 *   lasts as long as the page.
 * - **What comes back is not trusted.** Anything can be in a key - an older version of the
 *   application wrote it, or somebody typed it. `readJson` answers `unknown`; the caller checks
 *   the shape and falls back to its default.
 * - **Other tabs write too**, and the installed application next to the browser: `watchKey`
 *   tells a store to read again.
 */

/** The text under the key; `undefined` when there is none or the storage cannot be read. */
export function readText(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Keeps the text under the key; `undefined` removes the key. */
export function writeText(key: string, value: string | undefined): void {
  try {
    if (value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // nothing to do: the value then lasts as long as the page
  }
}

/** The value kept as JSON under the key; `undefined` when there is none or it is not JSON. */
export function readJson(key: string): unknown {
  const text = readText(key);
  if (text === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Keeps the value as JSON under the key; `undefined` removes the key. */
export function writeJson(key: string, value: unknown): void {
  writeText(key, value === undefined ? undefined : JSON.stringify(value));
}

/**
 * Calls `onChange` when another tab of this browser changes the key, or clears the storage.
 * Call in an injection context: the listening ends with the caller.
 */
export function watchKey(key: string, onChange: () => void): void {
  const view = inject(DOCUMENT).defaultView;
  const onStorage = (event: StorageEvent) => {
    // a null key is "everything was cleared"
    if (event.key === key || event.key === null) {
      onChange();
    }
  };
  view?.addEventListener('storage', onStorage);
  inject(DestroyRef).onDestroy(() => view?.removeEventListener('storage', onStorage));
}

/** True for anything with properties to look at - what a checked read of JSON starts with. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
