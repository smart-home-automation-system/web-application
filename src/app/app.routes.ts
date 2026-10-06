import { Routes } from '@angular/router';

import { Shell } from './core/layout/shell';

/**
 * No path here may start with `home`: the ingress sends everything under `/home` to
 * `api-gateway-service`, so such a page would never reach this application.
 */
export const routes: Routes = [
  {
    path: '',
    component: Shell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      {
        path: 'overview',
        title: 'Overview',
        loadComponent: () => import('./features/overview/overview').then((m) => m.Overview),
      },
      {
        path: 'about',
        title: 'About',
        loadComponent: () => import('./features/about/about').then((m) => m.About),
      },
      {
        path: 'error',
        title: 'Something went wrong',
        loadComponent: () => import('./features/error/error-page').then((m) => m.ErrorPage),
      },
      {
        path: '**',
        title: 'Page not found',
        loadComponent: () => import('./features/not-found/not-found').then((m) => m.NotFound),
      },
    ],
  },
];
