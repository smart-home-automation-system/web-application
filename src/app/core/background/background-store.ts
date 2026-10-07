import { Injectable, Signal, signal } from '@angular/core';

import { readJson, watchKey, writeJson } from '../storage/browser-storage';
import { isRecord } from '../util/is-record';

/** Where the choice is kept. One key for the whole browser, like the theme. */
const STORAGE_KEY = 'smart-home.background';

/**
 * Whether the views show their photo. On by default; switched off on the Settings page for a
 * device that is slow to blur a photo through the glass, and remembered in the browser - like
 * the theme override, and kept in step between tabs the same way.
 */
@Injectable({ providedIn: 'root' })
export class BackgroundStore {
  private readonly chosen = signal(true);

  /** True while the views show their photo. */
  readonly photos: Signal<boolean> = this.chosen.asReadonly();

  constructor() {
    this.read();
    watchKey(STORAGE_KEY, () => this.read());
  }

  showPhotos(on: boolean): void {
    this.chosen.set(on);
    // kept only while off: the default leaves nothing behind
    writeJson(STORAGE_KEY, on ? undefined : { photos: false });
  }

  private read(): void {
    // unreadable storage, or a value that is not what this store writes: as if nothing was chosen
    const value = readJson(STORAGE_KEY);
    this.chosen.set(!isRecord(value) || value['photos'] !== false);
  }
}
