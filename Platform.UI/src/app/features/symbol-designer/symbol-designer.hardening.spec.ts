import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildBreakdown } from './services/symbol-breakdown.service';
import { exportSymbol } from './services/symbol-export.service';
import {
  docFrom,
  fingerprint,
  idsOf,
  listSamples,
  parseOrThrow,
  readSample,
} from './testing/symbol-fixtures';

/** Phase 5: every sample symbol, every translation key. */
describe('symbol designer hardening', () => {
  const samples = listSamples();

  it('finds all sample symbols', () => {
    expect(samples.length).toBe(131);
  });

  it.each(samples)('%s imports, breaks down, exports and re-imports with stable ids', (file) => {
    const source = readSample(file);
    const original = parseOrThrow(source);
    const doc = docFrom(source);
    const breakdown = buildBreakdown(doc);
    const ids = breakdown.flat.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);

    const out = exportSymbol(doc, file, '2026-11-23T00:00:00.000Z');
    const reparsed = new DOMParser().parseFromString(out.svg, 'image/svg+xml').documentElement;
    expect(fingerprint(reparsed, idsOf(original))).toBe(fingerprint(original, idsOf(original)));
    expect(out.definition.elements.length).toBe(ids.length);
    expect(buildBreakdown(docFrom(out.svg)).flat.map((p) => p.id)).toEqual(ids);
  });

  it('breaks down the most complex sample quickly', () => {
    const source = readSample('illustrations/iso-virus.svg');
    const doc = docFrom(source);
    const start = performance.now();
    for (let i = 0; i < 10; i++) buildBreakdown(doc);
    const perRun = (performance.now() - start) / 10;
    expect(buildBreakdown(doc).flat.length).toBeGreaterThan(1000);
    // Generous bound for CI/jsdom; in the browser a rebuild runs after every edit.
    expect(perRun).toBeLessThan(150);
  });

  describe('translations', () => {
    const load = (lang: string) =>
      JSON.parse(readFileSync(`src/assets/i18n/${lang}.json`, 'utf8').replace(/^﻿/, ''));
    const flatten = (o: Record<string, unknown>, p = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === 'object'
          ? flatten(v as Record<string, unknown>, `${p}${k}.`)
          : [`${p}${k}`],
      );
    const en = new Set(flatten(load('en')));
    const ar = new Set(flatten(load('ar')));

    it('has identical key sets in en and ar', () => {
      expect([...en].filter((k) => !ar.has(k))).toEqual([]);
      expect([...ar].filter((k) => !en.has(k))).toEqual([]);
    });

    it('defines every static key used by the feature', () => {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = `${dir}/${name}`;
          if (statSync(full).isDirectory()) walk(full);
          else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) files.push(full);
        }
      };
      walk('src/app/features/symbol-designer');
      files.push('src/app/layout/shell.component.ts');
      const used = new Set<string>();
      for (const f of files) {
        for (const m of readFileSync(f, 'utf8').matchAll(
          /'((?:symbolDesigner|shell)\.[A-Za-z0-9.-]+[A-Za-z0-9])'/g,
        )) {
          used.add(m[1]);
        }
      }
      // Keys built dynamically (roles, errors, backdrop, ...) end with '.' and are covered by parity.
      const missing = [...used].filter((k) => !en.has(k));
      expect(used.size).toBeGreaterThan(80);
      expect(missing).toEqual([]);
    });
  });
});
