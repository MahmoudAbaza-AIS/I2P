import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;
  let document: Document;

  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [ThemeService],
    });

    service = TestBed.inject(ThemeService);
    document = TestBed.inject(DOCUMENT);
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should apply a data-theme attribute on init', () => {
    const attr = document.documentElement.getAttribute('data-theme');
    expect(['light', 'dark', 'high-contrast']).toContain(attr);
  });

  it('should set theme and update data-theme attribute', () => {
    service.setTheme('dark');
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('should persist theme to localStorage', () => {
    service.setTheme('high-contrast');
    expect(localStorage.getItem('platform.ui.theme')).toBe('high-contrast');
  });

  it('should not change theme when same value set twice', () => {
    service.setTheme('light');
    service.setTheme('light');
    expect(service.theme()).toBe('light');
  });

  it('should toggle between light and dark', () => {
    service.setTheme('light');
    service.toggleDarkMode();
    expect(service.theme()).toBe('dark');

    service.toggleDarkMode();
    expect(service.theme()).toBe('light');
  });

  it('should expose all three themes in availableThemes', () => {
    const values = service.availableThemes.map((t) => t.value);
    expect(values).toContain('light');
    expect(values).toContain('dark');
    expect(values).toContain('high-contrast');
  });

  it('should restore persisted theme on fresh service creation', () => {
    localStorage.setItem('platform.ui.theme', 'high-contrast');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [ThemeService] });
    const freshService = TestBed.inject(ThemeService);
    expect(freshService.theme()).toBe('high-contrast');
  });
});
