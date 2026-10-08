import { BOTTOM_BAR_PLACES, NAV_ITEMS, NavItem, splitForBottomBar } from './navigation';

function items(count: number): NavItem[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `/page-${index + 1}`,
    label: 'nav.overview',
    icon: 'dashboard',
    access: 'admin',
  }));
}

const paths = (list: readonly NavItem[]) => list.map((item) => item.path);

describe('the bottom bar of a phone', () => {
  it.each([0, 1, 4, 5])('shows all of %i entries, with nothing behind "More"', (count) => {
    const { bar, more } = splitForBottomBar(items(count));

    expect(bar).toHaveLength(count);
    expect(more).toEqual([]);
  });

  // "More" takes a place itself: with six entries a bar of five holds four of them
  it('keeps its last place for "More" once there are more entries than places', () => {
    const { bar, more } = splitForBottomBar(items(6));

    expect(paths(bar)).toEqual(['/page-1', '/page-2', '/page-3', '/page-4']);
    expect(paths(more)).toEqual(['/page-5', '/page-6']);
    expect(bar.length + 1).toBe(BOTTOM_BAR_PLACES);
  });

  it('puts everything that does not fit behind "More", in order', () => {
    const { bar, more } = splitForBottomBar(items(9));

    expect(paths([...bar, ...more])).toEqual(paths(items(9)));
    expect(more).toHaveLength(5);
  });

  // what is looked at every day has to be in the bar; the settings and the build are not
  it('leaves the settings and the build of the application for "More"', () => {
    const { more } = splitForBottomBar(NAV_ITEMS.filter((item) => item.path !== '/room'));

    expect(paths(more)).not.toContain('/overview');
    expect(paths(NAV_ITEMS).slice(-2)).toEqual(['/settings', '/about']);
  });
});
