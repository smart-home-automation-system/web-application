import { Route } from '@angular/router';

import { routes } from './app.routes';
import { NAV_ITEMS } from './core/layout/navigation';

function allPaths(list: readonly Route[], prefix = ''): string[] {
  return list.flatMap((route) => {
    const path = [prefix, route.path].filter(Boolean).join('/');
    return [path, ...allPaths(route.children ?? [], path)];
  });
}

describe('routes', () => {
  // the ingress sends /home to the API gateway: a page under it would never reach the application
  it('keep clear of the /home prefix, which belongs to the backend', () => {
    const clashing = allPaths(routes).filter((path) => path === 'home' || path.startsWith('home/'));

    expect(clashing).toEqual([]);
  });

  it('exist for every navigation entry', () => {
    const paths = allPaths(routes);

    for (const item of NAV_ITEMS) {
      expect(paths).toContain(item.path.replace(/^\//, ''));
    }
  });

  it('end with the catch-all, so an unknown address shows the not-found page', () => {
    const children = routes[0].children ?? [];

    expect(children.at(-1)?.path).toBe('**');
  });

  it('give every page a title', () => {
    const untitled = (routes[0].children ?? []).filter(
      (route) => !route.redirectTo && route.title === undefined,
    );

    expect(untitled).toEqual([]);
  });
});
