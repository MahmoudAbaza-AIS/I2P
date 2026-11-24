import { DOCUMENT, Injectable, inject } from '@angular/core';
import { SVG_NS } from '../utils/svg-dom';

/** Max accepted SVG size. POC used 5 MB; three sample photos are 5.03 MB (log D7). */
export const MAX_SVG_BYTES = 10 * 1024 * 1024;

export type ImportErrorCode = 'notSvgFile' | 'tooLarge' | 'invalidSvg' | 'noSvgRoot';

export type ImportResult =
  | { readonly ok: true; readonly root: SVGSVGElement }
  | { readonly ok: false; readonly error: ImportErrorCode };

/** Elements removed outright (POC list). */
const BLOCKED_TAGS = ['script', 'foreignObject', 'iframe', 'object', 'embed'];
const ANIMATION_TAGS = new Set(['animate', 'set', 'animateTransform', 'animateMotion']);

/** Unit → px factors for width/height without a viewBox. */
const UNIT_PX: Readonly<Record<string, number>> = {
  '': 1,
  px: 1,
  pt: 4 / 3,
  pc: 16,
  mm: 96 / 25.4,
  cm: 96 / 2.54,
  in: 96,
};

/** Parse a length like "12mm" to px; returns 0 for percentages or junk. */
export function lengthToPx(value: string | null): number {
  if (!value) return 0;
  const m = value.trim().match(/^([+-]?\d*\.?\d+(?:e[+-]?\d+)?)\s*([a-z]*)$/i);
  if (!m) return 0;
  const factor = UNIT_PX[m[2].toLowerCase()];
  if (factor === undefined) return 0;
  const px = Number(m[1]) * factor;
  return Number.isFinite(px) && px > 0 ? px : 0;
}

/** POC rule: any `url(...)` that is not an internal `#fragment` reference is unsafe. */
export function isUnsafeUrlValue(value: string): boolean {
  const re = /url\(([^)]*)\)?/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    const target = match[1]
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .trim();
    if (!target.startsWith('#')) return true;
  }
  return false;
}

function sanitizeAttributes(el: Element): void {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    const value = attr.value.trim().toLowerCase();
    if (name.startsWith('on')) {
      el.removeAttribute(attr.name);
    } else if ((name === 'href' || name.endsWith(':href')) && value) {
      if (!value.startsWith('#') && !value.startsWith('data:image/')) el.removeAttribute(attr.name);
    } else if (isUnsafeUrlValue(attr.value)) {
      el.removeAttribute(attr.name);
    }
  }
}

/**
 * Parse and sanitize SVG markup. Pure apart from DOMParser / importNode.
 *
 * Ported from POC `SvgEditorService.parseAndSanitize`, plus:
 * - `<style>` blocks with `@import` or external `url()` are removed;
 * - SMIL animations that target `href` or event attributes are removed;
 * - processing instructions inside the tree are dropped;
 * - a missing viewBox is derived from width/height *with units* (POC dropped units).
 */
export function parseAndSanitizeSvg(source: string, target: Document): ImportResult {
  let parsed: Document;
  try {
    parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
  } catch {
    return { ok: false, error: 'invalidSvg' };
  }
  if (parsed.getElementsByTagName('parsererror').length > 0)
    return { ok: false, error: 'invalidSvg' };
  const svg = parsed.documentElement;
  if (!svg || svg.localName.toLowerCase() !== 'svg') return { ok: false, error: 'noSvgRoot' };

  for (const tag of BLOCKED_TAGS) {
    Array.from(svg.getElementsByTagName(tag)).forEach((n) => n.remove());
  }
  for (const style of Array.from(svg.getElementsByTagName('style'))) {
    const css = style.textContent ?? '';
    if (/@import/i.test(css) || isUnsafeUrlValue(css)) style.remove();
  }

  const walker = parsed.createTreeWalker(svg, 0x1 | 0x40 /* ELEMENT | PROCESSING_INSTRUCTION */);
  const toRemove: Node[] = [];
  for (let node: Node | null = walker.currentNode; node; node = walker.nextNode()) {
    if (node.nodeType === 7) {
      toRemove.push(node);
      continue;
    }
    const el = node as Element;
    if (ANIMATION_TAGS.has(el.localName)) {
      const target = (el.getAttribute('attributeName') ?? '').toLowerCase();
      if (target.startsWith('on') || target === 'href' || target.endsWith(':href')) {
        toRemove.push(el);
        continue;
      }
    }
    sanitizeAttributes(el);
  }
  toRemove.forEach((n) => n.parentNode?.removeChild(n));

  if (!svg.hasAttribute('xmlns')) svg.setAttribute('xmlns', SVG_NS);
  if (!svg.hasAttribute('viewBox')) {
    const width = lengthToPx(svg.getAttribute('width')) || 300;
    const height = lengthToPx(svg.getAttribute('height')) || 200;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }
  return { ok: true, root: target.importNode(svg, true) as unknown as SVGSVGElement };
}

@Injectable({ providedIn: 'root' })
export class SvgImportService {
  private readonly document = inject(DOCUMENT);

  /** Validate a picked file (extension + size) before reading it. */
  validateFile(file: { name: string; size: number }): ImportErrorCode | null {
    if (!file.name.toLowerCase().endsWith('.svg')) return 'notSvgFile';
    if (file.size > MAX_SVG_BYTES) return 'tooLarge';
    return null;
  }

  parse(source: string): ImportResult {
    if (source.length > MAX_SVG_BYTES) return { ok: false, error: 'tooLarge' };
    return parseAndSanitizeSvg(source, this.document);
  }
}
