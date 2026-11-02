import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark' | 'high-contrast';

const STORAGE_KEY = 'platform.ui.theme';
const VALID_THEMES: Theme[] = ['light', 'dark', 'high-contrast'];

function isValidTheme(value: string): value is Theme {
  return VALID_THEMES.includes(value as Theme);
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  private readonly _theme = signal<Theme>(this.resolveInitialTheme());

  /** The currently active theme. */
  readonly theme = this._theme.asReadonly();

  readonly availableThemes: ReadonlyArray<{ value: Theme; label: string; icon: string }> = [
    { value: 'light', label: 'Light', icon: '☀️' },
    { value: 'dark', label: 'Dark', icon: '🌙' },
    { value: 'high-contrast', label: 'High Contrast', icon: '◑' },
  ];

  constructor() {
    this.applyTheme(this._theme());
  }

  /** Switch to the specified theme and persist the preference. */
  setTheme(theme: Theme): void {
    if (theme === this._theme()) return;
    this._theme.set(theme);
    this.applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }

  /** Toggle between light and dark (ignores high-contrast). */
  toggleDarkMode(): void {
    this.setTheme(this._theme() === 'dark' ? 'light' : 'dark');
  }

  private applyTheme(theme: Theme): void {
    this.document.documentElement.setAttribute('data-theme', theme);
  }

  private resolveInitialTheme(): Theme {
    // 1. Persisted user preference
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && isValidTheme(stored)) return stored;
    } catch {
      /* ignore */
    }

    // 2. OS dark-mode preference (may be unavailable in test runtimes)
    try {
      if (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
      ) {
        return 'dark';
      }
    } catch {
      /* ignore */
    }

    return 'light';
  }
}
