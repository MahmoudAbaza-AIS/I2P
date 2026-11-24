import { readFileSync, readdirSync, statSync } from 'node:fs';
import { SymbolDocument } from '../models/symbol.model';
import { parseAndSanitizeSvg } from '../services/svg-import.service';
import { createSymbolDocument } from '../services/symbol-breakdown.service';

/**
 * Spec-only helpers. Sample symbols are read (never written) from the public
 * folder; specs run with the Platform.UI folder as working directory.
 */
export const SYMBOLS_DIR = 'public/Executive Dashboard/Symbols';

/** Representative test set (SYMBOL_DESIGNER_INTEGRATION.md §3.3). */
export const REPRESENTATIVE = [
  'icons/tile-bed.svg',
  'chart-parts/capsule-filled-red.svg',
  'chart-parts/gauge-arc-cyan-empty.svg',
  'counters/counter-card-admission.svg',
  'illustrations/iso-operating-table-glow.svg',
] as const;

export function readSample(relPath: string): string {
  return readFileSync(`${SYMBOLS_DIR}/${relPath}`, 'utf8');
}

export function listSamples(): string[] {
  const out: string[] = [];
  for (const dir of readdirSync(SYMBOLS_DIR)) {
    const full = `${SYMBOLS_DIR}/${dir}`;
    if (!statSync(full).isDirectory()) continue;
    for (const f of readdirSync(full)) if (f.endsWith('.svg')) out.push(`${dir}/${f}`);
  }
  return out.sort();
}

export function parseOrThrow(source: string): SVGSVGElement {
  const result = parseAndSanitizeSvg(source, document);
  if (!result.ok) throw new Error(`import failed: ${result.error}`);
  return result.root;
}

export function docFrom(source: string): SymbolDocument {
  return createSymbolDocument(parseOrThrow(source));
}

/**
 * Structural fingerprint used to compare SVGs for visual equivalence:
 * tags, attributes and text, ignoring the metadata attributes the exporter
 * adds (`data-symbol-element/name/role/locked/hidden`) and ids it assigns to
 * id-less parts (pass the original to know which ids existed).
 */
export function fingerprint(root: Element, ignoreIdsNotIn?: ReadonlySet<string>): string {
  const skip = new Set([
    'data-symbol-element',
    'data-name',
    'data-role',
    'data-locked',
    'data-hidden',
  ]);
  const walk = (el: Element): string => {
    const attrs = Array.from(el.attributes)
      .filter((a) => !skip.has(a.name) && a.name !== 'xmlns')
      .filter((a) => !(a.name === 'id' && ignoreIdsNotIn && !ignoreIdsNotIn.has(a.value)))
      .map((a) => `${a.name}=${a.value}`)
      .sort()
      .join(' ');
    const kids = Array.from(el.children).map(walk).join('');
    const text = el.children.length === 0 ? (el.textContent ?? '').trim() : '';
    return `<${el.localName} ${attrs}>${text}${kids}</>`;
  };
  return walk(root);
}

export function idsOf(root: Element): Set<string> {
  return new Set(Array.from(root.querySelectorAll('[id]')).map((e) => e.getAttribute('id') ?? ''));
}

export const fakeGeometry = {
  localBBox: (el: Element) => {
    const x = Number(el.getAttribute('x') ?? 0);
    const y = Number(el.getAttribute('y') ?? 0);
    const w = Number(el.getAttribute('width') ?? 10);
    const h = Number(el.getAttribute('height') ?? 10);
    return { x, y, width: w, height: h };
  },
};
