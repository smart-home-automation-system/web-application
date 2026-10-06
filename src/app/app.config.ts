import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideBrowserGlobalErrorListeners } from '@angular/core';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import {
  RedirectCommand,
  Router,
  TitleStrategy,
  provideRouter,
  withNavigationErrorHandler,
} from '@angular/router';

import { routes } from './app.routes';
import { mockApiInterceptors } from './core/api/mock-api';
import { AppTitleStrategy } from './core/layout/app-title-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      // a navigation that cannot complete - typically a lazy chunk that is gone after a
      // deploy - ends on the error page instead of a dead click
      withNavigationErrorHandler((error) => {
        console.error('Navigation failed', error);
        return new RedirectCommand(inject(Router).parseUrl('/error'), {
          skipLocationChange: true,
        });
      }),
    ),
    provideHttpClient(withInterceptors([...mockApiInterceptors])),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    // icons are the self-hosted Material Symbols font, not the legacy Material Icons
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },
  ],
};
