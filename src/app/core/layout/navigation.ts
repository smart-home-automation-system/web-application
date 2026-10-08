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
 * with its route. The shell lists only the entries the active profile may open.
 *
 * The order matters on a phone: its bottom bar holds five places. Up to five entries are all
 * shown; from the sixth on the bar shows the first four and a "More" button that lists the rest
 * (`splitForBottomBar`). So what is looked at most goes first, and what is opened once in a
 * while - the settings, the build - last.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/overview', label: 'nav.overview', icon: 'dashboard', access: 'admin' },
  { path: '/water', label: 'nav.hotWater', icon: 'water_drop', access: 'admin' },
  { path: '/boiler', label: 'nav.boilerRoom', icon: 'water_heater', access: 'admin' },
  { path: '/room', label: 'nav.myRoom', icon: 'bed', access: 'member' },
  { path: '/settings', label: 'nav.settings', icon: 'settings', access: 'admin' },
  { path: '/about', label: 'nav.about', icon: 'info', access: 'admin' },
];

/** How many places the bottom bar of a phone has. */
export const BOTTOM_BAR_PLACES = 5;

/**
 * What the bottom bar shows of the entries somebody may open: all of them while they fit, and
 * otherwise all but the last place, which becomes the "More" button for the rest.
 */
export function splitForBottomBar(items: readonly NavItem[]): {
  readonly bar: readonly NavItem[];
  readonly more: readonly NavItem[];
} {
  if (items.length <= BOTTOM_BAR_PLACES) {
    return { bar: items, more: [] };
  }
  return { bar: items.slice(0, BOTTOM_BAR_PLACES - 1), more: items.slice(BOTTOM_BAR_PLACES - 1) };
}
