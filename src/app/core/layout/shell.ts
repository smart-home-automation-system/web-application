import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { APP_NAME } from './app-title-strategy';
import { LanguageMenu } from './language-menu';
import { NAV_ITEMS } from './navigation';
import { ViewBackground } from './view-background';

/**
 * The frame around every page: the panel (brand, main navigation, language) and the routed
 * content, over the photo of the open view and the glow of the season. The panel is a column on
 * the left of a wide screen and a bar across the top of a phone, where the navigation is a
 * bottom bar instead; both navigations are in the DOM and CSS shows one of them, so the layout
 * never jumps while JavaScript measures the screen.
 */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatListModule,
    MatIconModule,
    TranslocoDirective,
    LanguageMenu,
    ViewBackground,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  protected readonly appName = APP_NAME;
  protected readonly navItems = NAV_ITEMS;

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
