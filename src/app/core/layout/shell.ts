import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { filter } from 'rxjs';

import { PROFILES_PATH, accessOf, redirectFor } from '../profile/access';
import { ProfileStore } from '../profile/profile-store';
import { APP_NAME } from './app-title-strategy';
import { LanguageMenu } from './language-menu';
import { NAV_ITEMS } from './navigation';
import { Notices } from './notices';
import { ViewBackground } from './view-background';

/**
 * The frame around every page: the panel (brand, main navigation, profile, language), what
 * concerns every page (no connection to the house, a new version) and the routed content, over
 * the photo of the open view and the glow of the season. The panel is a column on
 * the left of a wide screen and a bar across the top of a phone, where the navigation is a
 * bottom bar instead; both navigations are in the DOM and CSS shows one of them, so the layout
 * never jumps while JavaScript measures the screen.
 *
 * The navigation lists what the active profile may open: everything for the administrator, their
 * own page for a resident, nothing while nobody is chosen.
 */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatListModule,
    MatIconModule,
    TranslocoDirective,
    LanguageMenu,
    Notices,
    ViewBackground,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  private readonly router = inject(Router);
  protected readonly appName = APP_NAME;
  protected readonly profilesPath = PROFILES_PATH;
  protected readonly profile = inject(ProfileStore).profile;
  protected readonly navItems = computed(() =>
    NAV_ITEMS.filter((item) => redirectFor(item.access, this.profile()) === undefined),
  );

  constructor() {
    // The guard judged the open page by the profile of that moment. A profile can change under
    // an open page - the registry answers with another role, the member is switched off, another
    // tab opens somebody else's link - so the same rule is asked again, and a page its viewer
    // may no longer see is left. It is asked at the end of every navigation too: a profile that
    // changes while a page is on its way was judged by the guard before the change, and by this
    // check on the page being left.
    const arrived = toSignal(
      this.router.events.pipe(filter((event) => event instanceof NavigationEnd)),
    );
    effect(() => {
      const profile = this.profile();
      arrived();
      untracked(() => {
        const target = redirectFor(accessOf(this.router.routerState.snapshot.root), profile);
        if (target !== undefined) {
          void this.router.navigateByUrl(target, { replaceUrl: true });
        }
      });
    });
  }

  /**
   * Moves the keyboard focus past the navigation. Done in code because of `<base href="/">`:
   * the browser resolves a bare `#main-content` against it, so following the link would load
   * the start page instead of jumping within this one.
   */
  protected skipToContent(event: Event, main: HTMLElement): void {
    event.preventDefault();
    main.focus();
  }
}
