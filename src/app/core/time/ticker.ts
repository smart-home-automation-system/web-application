import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, Signal, inject, signal } from '@angular/core';

const TICK_MS = 5_000;

/**
 * One shared clock for everything that shows an age ("updated 2 min ago", stale flags), so a
 * page full of tiles runs a single timer. It also moves when the tab becomes visible again,
 * because browsers throttle timers of hidden tabs.
 */
@Injectable({ providedIn: 'root' })
export class Ticker {
  private readonly document = inject(DOCUMENT);
  private readonly time = signal(Date.now());

  /** Epoch milliseconds, refreshed every few seconds. */
  readonly now: Signal<number> = this.time.asReadonly();

  constructor() {
    const tick = () => this.time.set(Date.now());
    const timer = setInterval(tick, TICK_MS);
    this.document.addEventListener('visibilitychange', tick);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.document.removeEventListener('visibilitychange', tick);
    });
  }
}
