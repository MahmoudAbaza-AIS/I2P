import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { AuthService } from '../auth/auth.service';

/**
 * Attaches the Bearer access token to outgoing requests when the user
 * is authenticated.  Only applied to same-origin /api requests.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Only attach tokens to API calls (not config.json, i18n assets, etc.)
  if (!req.url.startsWith('/api') && !req.url.includes('/api/')) {
    return next(req);
  }

  const auth = inject(AuthService);
  const token = auth.getAccessToken();

  if (!token) {
    return next(req);
  }

  const cloned = req.clone({
    headers: req.headers.set('Authorization', `Bearer ${token}`),
  });

  return next(cloned);
};
