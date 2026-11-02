import {
  APP_INITIALIZER,
  ApplicationConfig,
  inject,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideTransloco } from '@jsverse/transloco';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { provideOAuthClient } from 'angular-oauth2-oidc';

import { routes } from './app.routes';
import { correlationIdInterceptor } from './core/http/correlation-id.interceptor';
import { authInterceptor } from './core/http/auth.interceptor';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader';
import { provideRuntimeConfig } from './core/config/runtime-config.loader';
import { AuthService } from './core/auth/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),

    // ── Router ──────────────────────────────────────────────────────────
    provideRouter(
      routes,
      withComponentInputBinding()
    ),

    // ── HTTP ────────────────────────────────────────────────────────────
    provideHttpClient(
      withFetch(),
      withInterceptors([correlationIdInterceptor, authInterceptor])
    ),

    // ── Animations (async = defer chunk) ────────────────────────────────
    provideAnimationsAsync(),

    // ── Runtime config — must be loaded before auth init ────────────────
    provideRuntimeConfig(),

    // ── OAuth2 / OIDC ───────────────────────────────────────────────────
    provideOAuthClient(),

    // ── Auth initialiser (runs after runtime config) ─────────────────────
    {
      provide: APP_INITIALIZER,
      useFactory: () => {
        const auth = inject(AuthService);
        return () => auth.initialize();
      },
      multi: true,
    },

    // ── Transloco i18n ───────────────────────────────────────────────────
    provideTransloco({
      config: {
        availableLangs: ['en', 'ar'],
        defaultLang: 'en',
        reRenderOnLangChange: true,
        prodMode: false, // set to !isDevMode() in production build
        missingHandler: {
          logMissingKey: true,
          useFallbackTranslation: false,
          allowEmpty: false,
        },
      },
      loader: TranslocoHttpLoader,
    }),

    // ── PrimeNG 21 with Aura theme ───────────────────────────────────────
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          // Match the data-theme attribute set by ThemeService
          darkModeSelector: '[data-theme="dark"], [data-theme="high-contrast"]',
          cssLayer: {
            name: 'primeng',
            order: 'tailwind-base, primeng, tailwind-utilities',
          },
        },
      },
      ripple: true,
    }),
  ],
};
