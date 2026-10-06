export interface NavItem {
  readonly path: string;
  readonly label: string;
  /** Name of a Material Symbols icon. */
  readonly icon: string;
}

/**
 * Destinations of the main navigation, in display order. A feature adds its entry here together
 * with its route. The phone layout shows them in a bottom bar, which holds five at most.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/overview', label: 'Overview', icon: 'dashboard' },
  { path: '/about', label: 'About', icon: 'info' },
];
