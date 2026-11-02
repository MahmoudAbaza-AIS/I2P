import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideTransloco } from '@jsverse/transloco';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocaleService } from './locale.service';
import { TranslocoHttpLoader } from './transloco-loader';
import { DOCUMENT } from '@angular/common';

describe('LocaleService', () => {
  let service: LocaleService;
  let document: Document;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideTransloco({
          config: {
            availableLangs: ['en', 'ar'],
            defaultLang: 'en',
            reRenderOnLangChange: true,
            prodMode: true,
            missingHandler: { allowEmpty: true, logMissingKey: false, useFallbackTranslation: false },
          },
          loader: TranslocoHttpLoader,
        }),
        LocaleService,
      ],
    });

    service = TestBed.inject(LocaleService);
    document = TestBed.inject(DOCUMENT);
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('lang');
    document.documentElement.removeAttribute('dir');
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should default to "en" when no preference is stored', () => {
    expect(service.lang()).toBe('en');
  });

  it('should set lang and update document attributes', () => {
    service.setLang('ar');
    expect(service.lang()).toBe('ar');
    expect(document.documentElement.getAttribute('lang')).toBe('ar');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
  });

  it('should set ltr dir for English', () => {
    service.setLang('en');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });

  it('should report isRtl correctly', () => {
    service.setLang('en');
    expect(service.isRtl()).toBe(false);

    service.setLang('ar');
    expect(service.isRtl()).toBe(true);
  });

  it('should persist lang to localStorage', () => {
    service.setLang('ar');
    expect(localStorage.getItem('platform.ui.lang')).toBe('ar');
  });

  it('should expose availableLangs with en and ar', () => {
    const codes = service.availableLangs.map((l) => l.code);
    expect(codes).toContain('en');
    expect(codes).toContain('ar');
  });
});
