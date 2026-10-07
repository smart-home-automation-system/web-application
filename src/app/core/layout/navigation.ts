import { MessageKey } from '../../i18n/messages';
import { Access } from '../profile/access';

export interface NavItem {
  readonly path: string;
  /** Key of the label; the shell translates it. */
  readonly label: MessageKey;
  /** Name of a Material Symbols icon. */
  readonly icon: string;
  /** Who is offered the entry - the same as `data.access` of its route (a test compares them). */
  readonly access: Access;
}

/**
 * Destinations of the main navigation, in display order. A feature adds its entry here together
 * with its route. The phone layout shows them in a bottom bar, which holds five at most. The
 * shell lists only the entries the active profile may open.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/overview', label: 'nav.overview', icon: 'dashboard', access: 'admin' },
  { path: '/room', label: 'nav.myRoom', icon: 'bed', access: 'member' },
  { path: '/settings', label: 'nav.settings', icon: 'settings', access: 'admin' },
  { path: '/about', label: 'nav.about', icon: 'info', access: 'admin' },
];
