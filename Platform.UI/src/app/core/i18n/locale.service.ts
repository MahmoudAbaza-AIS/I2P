import { Injectable, DOCUMENT, inject, signal, computed } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

export type SupportedLang = 'en' | 'ar';

const STORAGE_KEY = 'platform.ui.lang';
const RTL_LANGS: SupportedLang[] = ['ar'];

const AVAILABLE_LANGS: SupportedLang[] = ['en', 'ar'];

function isSupported(lang: string): lang is SupportedLang {
  return AVAILABLE_LANGS.includes(lang as SupportedLang);
}

@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly document = inject(DOCUMENT);
  private readonly transloco = inject(TranslocoService);

  private readonly _lang = signal<SupportedLang>(this.resolveInitialLang());

  /** Current active language. */
  readonly lang = this._lang.asReadonly();

  /** Whether the current language is RTL. */
  readonly isRtl = computed(() => RTL_LANGS.includes(this._lang()));

  /** All supported languages with display labels. */
  readonly availableLangs: ReadonlyArray<{ code: SupportedLang; label: string }> = [
    { code: 'en', label: 'English' },
    { code: 'ar', label: 'العربية' },
  ];

  constructor() {
    // Apply initial lang to document
    this.applyLang(this._lang());
  }

  /** Switch the active language; persists to localStorage. */
  setLang(lang: SupportedLang): void {
    if (lang === this._lang()) return;
    this._lang.set(lang);
    this.applyLang(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // localStorage may be unavailable in some environments
    }
  }

  private applyLang(lang: SupportedLang): void {
    const html = this.document.documentElement;
    html.setAttribute('lang', lang);
    html.setAttribute('dir', RTL_LANGS.includes(lang) ? 'rtl' : 'ltr');
    this.transloco.setActiveLang(lang);
  }

  private resolveInitialLang(): SupportedLang {
    // 1. Persisted preference
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && isSupported(stored)) return stored;
    } catch {
      /* ignore */
    }

    // 2. Browser preference
    const browserLang = navigator.language?.split('-')[0];
    if (browserLang && isSupported(browserLang)) return browserLang;

    // 3. Default
    return 'en';
  }
}
