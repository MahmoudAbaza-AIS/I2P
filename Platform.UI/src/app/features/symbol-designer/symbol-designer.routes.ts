import { Routes } from '@angular/router';

/** Lazy-loaded routes for the Symbol Designer feature (one chunk). */
export const SYMBOL_DESIGNER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./symbol-designer-page.component').then((m) => m.SymbolDesignerPageComponent),
    title: 'Symbol Designer — Platform UI',
  },
];
