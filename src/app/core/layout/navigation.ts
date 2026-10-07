import { MessageKey } from '../../i18n/messages';

export interface NavItem {
  readonly path: string;
  /** Key of the label; the shell translates it. */
  readonly label: MessageKey;
  /** Name of a Material Symbols icon. */
  readonly icon: string;
}

/**
 * Destinations of the main navigation, in display order. A feature adds its entry here together
 * with its route. The phone layout shows them in a bottom bar, which holds five at most.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/overview', label: 'nav.overview', icon: 'dashboard' },
  { path: '/settings', label: 'nav.settings', icon: 'settings' },
  { path: '/about', label: 'nav.about', icon: 'info' },
];
