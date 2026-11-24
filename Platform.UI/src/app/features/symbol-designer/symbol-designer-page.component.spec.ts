import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SymbolDesignerPageComponent } from './symbol-designer-page.component';
import { SymbolDesignerStore } from './state/symbol-designer.store';
import { LIBRARY_MANIFEST_URL } from './services/symbol-library.service';
import { SymbolLibraryEntry } from './models/symbol.model';
import { readSample } from './testing/symbol-fixtures';

const translations = (lang: 'en' | 'ar') =>
  JSON.parse(readFileSync(`src/assets/i18n/${lang}.json`, 'utf8').replace(/^﻿/, ''));

const ENTRY: SymbolLibraryEntry = {
  category: 'icons',
  file: 'tile-bed.svg',
  name: 'Tile bed',
  url: '/Executive Dashboard/Symbols/icons/tile-bed.svg',
  sizeKb: 1,
};

describe('SymbolDesignerPageComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SymbolDesignerPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTransloco({
          config: {
            availableLangs: ['en', 'ar'],
            defaultLang: 'en',
            reRenderOnLangChange: true,
            prodMode: true,
            missingHandler: {
              logMissingKey: false,
              useFallbackTranslation: false,
              allowEmpty: false,
            },
          },
        }),
      ],
    }).compileComponents();
    const transloco = TestBed.inject(TranslocoService);
    transloco.setTranslation(translations('en'), 'en');
    transloco.setTranslation(translations('ar'), 'ar');
    transloco.setActiveLang('en');
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(SymbolDesignerPageComponent);
    fixture.detectChanges();
    http.expectOne(LIBRARY_MANIFEST_URL).flush([ENTRY]);
    fixture.detectChanges();
    const store = fixture.debugElement.injector.get(SymbolDesignerStore);
    return { fixture, store, el: fixture.nativeElement as HTMLElement };
  }

  it('renders the empty designer with translated chrome', () => {
    const { el } = create();
    expect(el.querySelector('h1')?.textContent).toContain('Symbol Designer');
    expect(el.textContent).toContain('No symbol open');
    expect(el.textContent).toContain('Tile bed');
    expect(el.textContent).not.toMatch(/symbolDesigner\./); // no raw keys
  });

  it('opens a library symbol, edits it, and keeps the session across a language switch', () => {
    const { fixture, store, el } = create();
    store.openLibraryEntry(ENTRY);
    http.expectOne(encodeURI(ENTRY.url)).flush(readSample(ENTRY.category + '/' + ENTRY.file));
    fixture.detectChanges();

    expect(store.loadState()).toBe('ready');
    expect(el.querySelector('.sd-canvas__symbol > svg')).not.toBeNull();
    expect(el.querySelectorAll('[role="treeitem"]').length).toBeGreaterThan(0);

    const first = store.roots()[0].id;
    store.select(first);
    store.rename('Bed frame');
    fixture.detectChanges();
    expect(el.textContent).toContain('Bed frame');

    TestBed.inject(TranslocoService).setActiveLang('ar');
    fixture.detectChanges();
    expect(el.querySelector('h1')?.textContent).toContain('مصمم الرموز');
    expect(store.primaryId()).toBe(first);
    expect(store.canUndo()).toBe(true);
    expect(el.textContent).toContain('Bed frame');
    expect(el.textContent).not.toMatch(/symbolDesigner\./);

    store.undo();
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Bed frame');
  });

  it('shows a translated error state for an invalid file', async () => {
    const { fixture, store, el } = create();
    await store.importFile(new File(['<svg><g></svg>'], 'broken.svg', { type: 'image/svg+xml' }));
    fixture.detectChanges();
    expect(store.loadState()).toBe('error');
    expect(el.textContent).toContain('The selected file is not valid SVG.');
  });
});
