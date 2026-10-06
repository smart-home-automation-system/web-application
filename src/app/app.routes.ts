import { Route, Routes } from '@angular/router';

import { Shell } from './core/layout/shell';
import { ErrorPage } from './features/error/error-page';
import { MessageKey } from './i18n/messages';

/** A page of the application: its `title` is the key of the text shown in the browser tab. */
type Page = Route & { title?: MessageKey };

const pages: Page[] = [
  { path: '', pathMatch: 'full', redirectTo: 'overview' },
  {
    path: 'overview',
    title: 'nav.overview',
    loadComponent: () => import('./features/overview/overview').then((m) => m.Overview),
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
    path: 'error',
    title: 'errorPage.title',
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
export const routes: Routes = [{ path: '', component: Shell, children: pages }];
