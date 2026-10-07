import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  computed,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
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
import { provideI18n } from './core/i18n/provide-i18n';
import { LANGUAGE_OWNER } from './core/i18n/language-store';
import { AppTitleStrategy } from './core/layout/app-title-strategy';
import { profileInterceptor } from './core/profile/profile-interceptor';
import { ProfileStore } from './core/profile/profile-store';
import { ThemeStore } from './core/theme/theme-store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      // a navigation that cannot complete - typically a lazy chunk that is gone after a
      // deploy - ends on the error page instead of a dead click
      withNavigationErrorHandler((error) => {
        console.error('Navigation failed', error.error);
        // the error page itself failing must not redirect to the error page again
        if (error.url.startsWith('/error')) {
          return;
        }
        return new RedirectCommand(inject(Router).parseUrl('/error'), {
          skipLocationChange: true,
        });
      }),
    ),
    provideHttpClient(withInterceptors([profileInterceptor, ...mockApiInterceptors])),
    // the language is the choice of whoever uses the application: of the active profile
    {
      provide: LANGUAGE_OWNER,
      useFactory: () => {
        const profile = inject(ProfileStore).profile;
        return computed(() => profile()?.name);
      },
    },
    ...provideI18n(),
    // The application starts as whoever was remembered and does not wait for this: the registry
    // is asked on the side, and a role that changed there takes effect when it answers.
    provideAppInitializer(() => {
      void inject(ProfileStore).refresh();
    }),
    // the colours of the season are in place before Angular renders the first page
    provideAppInitializer(() => {
      inject(ThemeStore);
    }),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    // icons are the self-hosted Material Symbols font, not the legacy Material Icons
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },
  ],
};
