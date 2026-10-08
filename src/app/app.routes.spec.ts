import { Route } from '@angular/router';

import { routes } from './app.routes';
import { NAV_ITEMS } from './core/layout/navigation';
import { profileGuard } from './core/profile/profile-guard';

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

  // the error page is where a navigation ends when a lazy chunk cannot be downloaded any more -
  // it would be unreachable exactly then if it were a lazy chunk itself
  it('load the error page with the application, not on demand', () => {
    const error = (routes[0].children ?? []).find((route) => route.path === 'error');

    expect(error?.component).toBeDefined();
    expect(error?.loadComponent).toBeUndefined();
  });

  // `data` has an index signature, so a misspelled key would type-check and the view would
  // silently show the plain glow
  it.each([
    ['overview', 'home'],
    ['water', 'water'],
    ['boiler', 'boiler'],
  ])('name the photo of /%s under the key the background layer reads', (path, photo) => {
    const page = (routes[0].children ?? []).find((route) => route.path === path);

    expect(page?.data).toEqual({ background: photo });
  });

  it('put every page behind the guard of the profiles', () => {
    expect(routes).toHaveLength(1);
    expect(routes[0].canActivateChild).toEqual([profileGuard]);
  });

  // A page that says nothing is the administrator's. This list is everything somebody else can
  // open: adding to it is a decision, and the test is where it is written down.
  it('open to others than the administrator exactly the pages meant for them', () => {
    const open = (routes[0].children ?? [])
      .filter((route) => route.data?.['access'] !== undefined)
      .map((route) => [route.path, route.data?.['access']]);

    expect(open).toEqual([
      ['room', 'member'],
      ['profiles', 'chooser'],
      ['u/:member', 'anyone'],
      ['error', 'anyone'],
    ]);
  });

  // the navigation must not offer what the guard turns away, nor hide what it lets through
  it('offer every navigation entry to exactly those who may open its page', () => {
    const children = routes[0].children ?? [];

    for (const item of NAV_ITEMS) {
      const route = children.find((candidate) => `/${candidate.path}` === item.path);

      expect(route?.data?.['access'] ?? 'admin', item.path).toBe(item.access);
    }
  });

  it('give every page a title', () => {
    const untitled = (routes[0].children ?? []).filter(
      (route) => !route.redirectTo && route.title === undefined,
    );

    expect(untitled).toEqual([]);
  });
});
