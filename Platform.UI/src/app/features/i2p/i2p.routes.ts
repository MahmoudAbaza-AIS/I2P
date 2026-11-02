import { Routes } from '@angular/router';

/**
 * Lazy-loaded routes for the I2P (Integration) feature area.
 * All routes require the Integration.Reader role — enforce in parent guard.
 */
export const I2P_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'health',
    pathMatch: 'full',
  },
  {
    path: 'health',
    loadComponent: () =>
      import('./pages/health/health-page.component').then(
        (m) => m.HealthPageComponent
      ),
    title: 'Integration Health — Platform UI',
  },
  {
    path: 'exchanges',
    loadComponent: () =>
      import('./pages/exchanges/exchanges-page.component').then(
        (m) => m.ExchangesPageComponent
      ),
    title: 'Exchange History — Platform UI',
  },
];
