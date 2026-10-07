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

/** One photo on screen, arriving or on its way out. */
interface Layer {
  readonly name: BackgroundName;
  readonly srcset: string;
  /** Tells the layers apart in the DOM: the same photo can be shown again after another one. */
  readonly key: number;
}

/**
 * `loading`: the file is on its way, the layer is transparent; `shown`: it has arrived and is
 * (fading) in; `leaving`: it is fading out and goes when the fade ends.
 */
type LayerState = 'loading' | 'shown' | 'leaving';

/**
 * The photo behind the glass: the one the open view names in its route data (`background`), as
 * a layer fixed to the screen under the glow of the shell. A view without one leaves the plain
 * glow, and so does the switch on the Settings page.
 *
 * A new photo is added transparent, fades in once its file has arrived (the `load` event - not
 * its insertion, which would end the fade before a slow link has delivered the picture) and the
 * layers under it are dropped when that fade ends. A photo that is no longer wanted fades out
 * and goes when its fade ends. With `prefers-reduced-motion` there is no fade: a photo shows as
 * it arrives and goes at once.
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
  protected readonly states = signal<ReadonlyMap<number, LayerState>>(new Map());

  constructor() {
    effect(() => {
      const name = this.wanted();
      untracked(() => this.show(name));
    });
  }

  protected state(key: number): LayerState {
    return this.states().get(key) ?? 'loading';
  }

  /** The file of the layer has arrived: fade it in - or, without motion, show it and drop the rest. */
  protected arrived(key: number): void {
    if (this.state(key) === 'leaving') {
      return;
    }
    this.setState(key, 'shown');
    if (this.reducedMotion()) {
      this.dropUnder(key);
    }
  }

  /** A fade has ended: a photo that faded in buries the ones under it, one that faded out goes. */
  protected settle(key: number): void {
    if (this.state(key) === 'leaving') {
      this.remove((layer) => layer.key === key);
    } else if (this.state(key) === 'shown') {
      this.dropUnder(key);
    }
  }

  private show(name: BackgroundName | undefined): void {
    const top = this.layers().at(-1);
    if (name === undefined) {
      this.hideAll();
      return;
    }
    if (top?.name === name && this.state(top.key) !== 'leaving') {
      return;
    }
    const layer: Layer = { name, srcset: backgroundSrcset(name), key: this.nextKey++ };
    this.layers.update((layers) => [...layers, layer]);
  }

  private hideAll(): void {
    if (this.reducedMotion()) {
      this.remove(() => true);
      return;
    }
    for (const layer of this.layers()) {
      this.setState(layer.key, 'leaving');
    }
  }

  private dropUnder(key: number): void {
    this.remove((layer) => layer.key < key);
  }

  private remove(which: (layer: Layer) => boolean): void {
    this.layers.update((layers) => layers.filter((layer) => !which(layer)));
    this.states.update((states) => {
      const kept = new Map(states);
      for (const [key] of states) {
        if (!this.layers().some((layer) => layer.key === key)) {
          kept.delete(key);
        }
      }
      return kept;
    });
  }

  private setState(key: number, state: LayerState): void {
    this.states.update((states) => new Map(states).set(key, state));
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
    return (
      this.document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    );
  }
}
