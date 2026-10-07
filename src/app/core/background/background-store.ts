import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, Signal, inject, signal } from '@angular/core';

/** Where the choice is kept. One key for the whole browser, like the theme. */
const STORAGE_KEY = 'smart-home.background';

/**
 * Whether the views show their photo. On by default; switched off on the Settings page for a
 * device that is slow to blur a photo through the glass, and remembered in the browser - like
 * the theme override, and kept in step between tabs the same way.
 */
@Injectable({ providedIn: 'root' })
export class BackgroundStore {
  private readonly document = inject(DOCUMENT);
  private readonly chosen = signal(true);

  /** True while the views show their photo. */
  readonly photos: Signal<boolean> = this.chosen.asReadonly();

  constructor() {
    this.read();
    this.watchOtherTabs();
  }

  showPhotos(on: boolean): void {
    this.chosen.set(on);
    // storage can be unavailable (private mode, blocked site data): the choice then lasts a session
    try {
      if (on) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ photos: false }));
      }
    } catch {
      // nothing to do
    }
  }

  private read(): void {
    let value: unknown;
    try {
      value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    } catch {
      // unreadable storage or a value that is not JSON: as if nothing was chosen
      value = null;
    }
    const photos = (typeof value === 'object' && value !== null ? value : {}) as Record<
      string,
      unknown
    >;
    this.chosen.set(photos['photos'] !== false);
  }

  private watchOtherTabs(): void {
    const view = this.document.defaultView;
    const onStorage = (event: StorageEvent) => {
      // a null key is "everything was cleared"
      if (event.key === STORAGE_KEY || event.key === null) {
        this.read();
      }
    };
    view?.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() => view?.removeEventListener('storage', onStorage));
  }
}
