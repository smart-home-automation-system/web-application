import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { APP_NAME } from './app-title-strategy';
import { NAV_ITEMS } from './navigation';

/**
 * The frame around every page: toolbar, main navigation and the routed content. The navigation
 * is a side list on wide screens and a bottom bar on phones; both are in the DOM and CSS shows
 * one of them, so the layout never jumps while JavaScript measures the screen.
 */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
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
