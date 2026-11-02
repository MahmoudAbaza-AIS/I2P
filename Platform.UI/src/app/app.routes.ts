import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  // ── OIDC callback ───────────────────────────────────────────────────
  {
    path: 'callback',
    // Minimal component: angular-oauth2-oidc handles the code exchange on
    // loadDiscoveryDocumentAndTryLogin(); redirect home after completion.
    loadComponent: () =>
      import('./pages/callback/callback.component').then(
        (m) => m.CallbackComponent
      ),
  },

  // ── Config-required page (no auth) ──────────────────────────────────
  {
    path: 'config-required',
    loadComponent: () =>
      import('./pages/config-required/config-required.component').then(
        (m) => m.ConfigRequiredComponent
      ),
  },

  // ── Shell with auth guard ────────────────────────────────────────────
  {
    path: '',
    loadComponent: () =>
      import('./layout/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'i2p/health',
        pathMatch: 'full',
      },
      {
        path: 'i2p',
        loadChildren: () =>
          import('./features/i2p/i2p.routes').then((m) => m.I2P_ROUTES),
      },
    ],
  },

  // ── Catch-all ────────────────────────────────────────────────────────
  {
    path: '**',
    redirectTo: '',
  },
];
