import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Route guard for authenticated areas.
 *
 * - OIDC not configured (D8 pending): allow shell/feature navigation so
 *   independent foundation work is usable; API calls surface 401/unauthorized.
 * - OIDC configured but user unauthenticated: start Authorization Code + PKCE.
 * - Authenticated: allow.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isConfigured()) {
    return true;
  }

  if (!auth.isAuthenticated()) {
    auth.login();
    return false;
  }

  return true;
};

/** Forces login when OIDC is configured; otherwise redirects to config-required. */
export const requireConfiguredAuthGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isConfigured()) {
    return router.createUrlTree(['/config-required']);
  }

  if (!auth.isAuthenticated()) {
    auth.login();
    return false;
  }

  return true;
};
