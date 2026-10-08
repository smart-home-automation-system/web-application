import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, Signal, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';

/** The longest the server goes unasked for a new version while the application is open. */
const LOOK_AGAIN_MS = 3_600_000;

/**
 * Tells when a newer version of the application is waiting. The service worker keeps the
 * application in the browser and starts it from there - at once, and without the network - so a
 * deployment reaches nobody by itself: the worker downloads the new version next to the running
 * one, and it takes over at the next load. This class says that it is ready, and reloads on
 * request.
 *
 * By itself the worker looks for a new version only when the application is loaded. An installed
 * application is hardly ever loaded - a phone brings it back from the background as it was - so
 * the server is also asked whenever the page comes back into view, and once an hour while it
 * stays there.
 *
 * Without a service worker - the dev server, a unit test, a browser that has none - there is
 * nothing to tell: every load is the newest version already.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdate {
  private readonly document = inject(DOCUMENT);
  private readonly updates = inject(SwUpdate, { optional: true });
  private readonly ready = signal(false);

  /** True once a newer version is downloaded and a reload would start it. */
  readonly available: Signal<boolean> = this.ready.asReadonly();

  constructor() {
    const updates = this.updates;
    if (!updates?.isEnabled) {
      return;
    }
    updates.versionUpdates
      .pipe(
        filter((event) => event.type === 'VERSION_READY'),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.ready.set(true));
    // the version in the browser lost a file it needs and cannot repair itself: only a reload,
    // which fetches the current version, brings the application back
    updates.unrecoverable.pipe(takeUntilDestroyed()).subscribe(() => this.ready.set(true));

    const look = () => {
      if (this.document.visibilityState === 'visible') {
        // fails while the server cannot be reached: the next look asks again
        updates.checkForUpdate().catch(() => undefined);
      }
    };
    const timer = setInterval(look, LOOK_AGAIN_MS);
    this.document.addEventListener('visibilitychange', look);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.document.removeEventListener('visibilitychange', look);
    });
  }

  /** Starts the newest version: a load of the page is when the worker hands it over. */
  reload(): void {
    this.document.location.reload();
  }
}
