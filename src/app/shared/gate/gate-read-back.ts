import { DestroyRef, inject } from '@angular/core';

/**
 * When a gate is read once more after a press (HAS-454): `gate-service` answers 204 once the Shelly took the pulse,
 * and the opening sensor of a garage gate tells the move about four seconds later (checked on the gate on
 * 2026-11-19), so the read right after the 204 still answers the state before.
 */
export const GATE_READ_AGAIN_AFTER_MS = 5_000;

/**
 * The read of the gates after a press: `refresh` at once - the press is over with that answer - and once more
 * `GATE_READ_AGAIN_AFTER_MS` later. Neither moves anything by itself: only what `gate-service` answers does. The
 * second read is a timer the owner clears when it is gone. Call in an injection context. (The pattern of
 * `airconReadBack`.)
 */
export function gateReadBack(refresh: () => Promise<void>): () => Promise<void> {
  const readsToCome = new Set<ReturnType<typeof setTimeout>>();
  inject(DestroyRef).onDestroy(() => readsToCome.forEach((read) => clearTimeout(read)));
  return () => {
    const read = setTimeout(() => {
      readsToCome.delete(read);
      void refresh();
    }, GATE_READ_AGAIN_AFTER_MS);
    readsToCome.add(read);
    return refresh();
  };
}
