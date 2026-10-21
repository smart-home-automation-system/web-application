import { DestroyRef, inject } from '@angular/core';

/**
 * When the lights are read once more after a command (HAS-293): an Eaton light reports its new
 * state through `amx-service` about a second after `light-service` took the command, so the read
 * right after it still answers the state before. A Shelly light has reported by then.
 */
export const LIGHTS_READ_AGAIN_AFTER_MS = 2_500;

/**
 * The read of the lights after a command (HAS-293, shared by the rooms and the lights pages since
 * HAS-266): `refresh` at once - the command, and its buttons, are over with that answer - and once
 * more `LIGHTS_READ_AGAIN_AFTER_MS` later, for an Eaton light that reports late. Neither moves
 * anything on screen by itself: only what `light-service` answers does. The second read is a timer
 * the owner clears when it is gone. Call in an injection context.
 */
export function lightReadBack(refresh: () => Promise<void>): () => Promise<void> {
  const readsToCome = new Set<ReturnType<typeof setTimeout>>();
  inject(DestroyRef).onDestroy(() => readsToCome.forEach((read) => clearTimeout(read)));
  return () => {
    const read = setTimeout(() => {
      readsToCome.delete(read);
      void refresh();
    }, LIGHTS_READ_AGAIN_AFTER_MS);
    readsToCome.add(read);
    return refresh();
  };
}
