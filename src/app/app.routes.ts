import { Route, Routes } from '@angular/router';

import { BackgroundName } from './core/background/backgrounds';
import { Shell } from './core/layout/shell';
import { Access } from './core/profile/access';
import { profileGuard } from './core/profile/profile-guard';
import { ErrorPage } from './features/error/error-page';
import { MessageKey } from './i18n/messages';

/**
 * A page of the application: its `title` is the key of the text shown in the browser tab, and
 * `data.background` names the photo behind it (`core/background/backgrounds.ts`); without one
 * the page shows the plain glow. `data.access` says who may open it (`core/profile/access.ts`):
 * **a page that does not say is the administrator's alone**.
 */
type Page = Route & {
  title?: MessageKey;
  data?: { background?: BackgroundName; access?: Access };
};

const pages: Page[] = [
  { path: '', pathMatch: 'full', redirectTo: 'overview' },
  {
    path: 'overview',
    title: 'nav.overview',
    data: { background: 'home' },
    loadComponent: () => import('./features/overview/overview').then((m) => m.Overview),
  },
  {
    path: 'heating',
    title: 'nav.heating',
    data: { background: 'heating' },
    loadComponent: () => import('./features/heating/heating').then((m) => m.Heating),
  },
  {
    path: 'water',
    title: 'nav.hotWater',
    data: { background: 'water' },
    loadComponent: () => import('./features/hot-water/hot-water').then((m) => m.HotWater),
  },
  {
    path: 'boiler',
    title: 'nav.boilerRoom',
    data: { background: 'boiler' },
    loadComponent: () => import('./features/boiler-room/boiler-room').then((m) => m.BoilerRoom),
  },
  {
    path: 'presence',
    title: 'nav.presence',
    data: { background: 'presence' },
    loadComponent: () => import('./features/presence/presence').then((m) => m.Presence),
  },
  {
    path: 'room',
    title: 'nav.myRoom',
    data: { access: 'member', background: 'room' },
    loadComponent: () => import('./features/my-room/my-room').then((m) => m.MyRoom),
  },
  {
    path: 'household',
    title: 'nav.household',
    data: { background: 'household' },
    loadComponent: () => import('./features/household/household').then((m) => m.Household),
  },
  {
    path: 'settings',
    title: 'nav.settings',
    loadComponent: () => import('./features/settings/settings').then((m) => m.Settings),
  },
  {
    path: 'about',
    title: 'nav.about',
    loadComponent: () => import('./features/about/about').then((m) => m.About),
  },
  {
    path: 'profiles',
    title: 'profiles.title',
    data: { access: 'chooser' },
    loadComponent: () => import('./features/profiles/profiles').then((m) => m.Profiles),
  },
  {
    // the personal link of a household member: opens their profile in this browser
    path: 'u/:member',
    title: 'personalLink.title',
    data: { access: 'anyone' },
    loadComponent: () =>
      import('./features/personal-link/personal-link').then((m) => m.PersonalLink),
  },
  {
    path: 'error',
    title: 'errorPage.title',
    data: { access: 'anyone' },
    // not lazy: this page is shown when a lazy chunk can no longer be downloaded
    component: ErrorPage,
  },
  {
    path: '**',
    title: 'notFound.title',
    loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
  },
];

/**
 * No path here may start with `home`: the ingress sends everything under `/home` to
 * `api-gateway-service`, so such a page would never reach this application.
 */
export const routes: Routes = [
  { path: '', component: Shell, canActivateChild: [profileGuard], children: pages },
];
