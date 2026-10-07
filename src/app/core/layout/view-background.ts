import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Signal,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

import { BackgroundStore } from '../background/background-store';
import { BackgroundName, backgroundSrcset, isBackgroundName } from '../background/backgrounds';

/** One photo on screen, or on its way out. */
interface Layer {
  readonly name: BackgroundName;
  readonly srcset: string;
  /** Tells the layers apart in the DOM: the same photo can be shown again after another one. */
  readonly key: number;
}

/**
 * The photo behind the glass: the one the open view names in its route data (`background`), as
 * a layer fixed to the screen under the glow of the shell. A view without one leaves the plain
 * glow, and so does the switch on the Settings page.
 *
 * A change of view cross-fades the photos: the new one is added on top and fades in, the old
 * ones are dropped once it has arrived. With `prefers-reduced-motion` there is no fade and the
 * old photo goes at once.
 */
@Component({
  selector: 'app-view-background',
  templateUrl: './view-background.html',
  styleUrl: './view-background.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.view-background--empty]': 'layers().length === 0',
    'aria-hidden': 'true',
  },
})
export class ViewBackground {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly store = inject(BackgroundStore);
  private nextKey = 0;

  /** The photo the open view names, read again after every navigation. */
  private readonly named: Signal<BackgroundName | undefined> = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.readRoute()),
    ),
    { initialValue: this.readRoute() },
  );

  /** What should be on screen: the named photo, unless the photos are switched off. */
  private readonly wanted = computed(() => (this.store.photos() ? this.named() : undefined));

  protected readonly layers = signal<readonly Layer[]>([]);

  constructor() {
    effect(() => {
      const name = this.wanted();
      untracked(() => this.show(name));
    });
  }

  /** The new photo has faded in: whatever lies under it can go. */
  protected settle(key: number): void {
    this.layers.update((layers) => layers.filter((layer) => layer.key >= key));
  }

  private show(name: BackgroundName | undefined): void {
    const current = this.layers().at(-1);
    if (current?.name === name) {
      return;
    }
    if (name === undefined) {
      this.layers.set([]);
      return;
    }
    const layer: Layer = { name, srcset: backgroundSrcset(name), key: this.nextKey++ };
    // no fade: nothing would ever report the new photo as arrived, so the old one goes now
    this.layers.update((layers) =>
      this.reducedMotion() ? [layer] : [...layers.slice(-1), layer],
    );
  }

  private readRoute(): BackgroundName | undefined {
    let route: ActivatedRouteSnapshot = this.router.routerState.snapshot.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    const name: unknown = route.data['background'];
    return isBackgroundName(name) ? name : undefined;
  }

  private reducedMotion(): boolean {
    // absent in the DOM used by unit tests
    return this.document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }
}
