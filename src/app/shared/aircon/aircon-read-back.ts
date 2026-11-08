import { DestroyRef, inject } from '@angular/core';

/**
 * When the units are read once more after a command (HAS-394): `aircon-service` answers 202 once the
 * unit took the bytes and confirms the command by its own read 2 s later (`lastCommandConfirmed`),
 * so the read right after the 202 may still answer the state before.
 */
export const AIRCON_READ_AGAIN_AFTER_MS = 2_500;

/**
 * The read of the units after a command: `refresh` at once - the command, and its buttons, are over
 * with that answer - and once more `AIRCON_READ_AGAIN_AFTER_MS` later. Neither moves anything by
 * itself: only what `aircon-service` answers does. The second read is a timer the owner clears when
 * it is gone. Call in an injection context. (The pattern of `lightReadBack`.)
 */
export function airconReadBack(refresh: () => Promise<void>): () => Promise<void> {
  const readsToCome = new Set<ReturnType<typeof setTimeout>>();
  inject(DestroyRef).onDestroy(() => readsToCome.forEach((read) => clearTimeout(read)));
  return () => {
    const read = setTimeout(() => {
      readsToCome.delete(read);
      void refresh();
    }, AIRCON_READ_AGAIN_AFTER_MS);
    readsToCome.add(read);
    return refresh();
  };
}
