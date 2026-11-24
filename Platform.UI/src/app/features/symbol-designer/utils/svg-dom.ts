import { PartKind } from '../models/symbol-part.model';
import { ViewBox } from '../models/symbol.model';

export const SVG_NS = 'http://www.w3.org/2000/svg';

/** Elements that become selectable parts (POC set plus `use`). */
export const PART_TAGS: ReadonlySet<string> = new Set([
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'image',
  'use',
]);

/** Containers walked through without becoming parts themselves. */
export const TRANSPARENT_TAGS: ReadonlySet<string> = new Set(['a', 'switch']);

/** Tags whose `x`/`y` attributes position the element (used when moving). */
export const POSITIONED_TAGS: ReadonlySet<string> = new Set(['text', 'rect', 'image', 'use']);

/** Shape tags receiving "apply to all group children" styling. */
export const STYLABLE_TAGS: ReadonlySet<string> = new Set([
  'text',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
]);

/** Gauge progress is applicable to stroke-able open paths (POC rule). */
export const GAUGE_TAGS: ReadonlySet<string> = new Set(['path', 'polyline', 'line']);

export function partKind(tag: string): PartKind {
  switch (tag) {
    case 'g':
      return 'group';
    case 'text':
      return 'text';
    case 'image':
      return 'image';
    case 'use':
      return 'use';
    default:
      return 'shape';
  }
}

/** Finite number from an attribute value, else 0 (POC `number`). */
export function num(value: string | null | undefined): number {
  if (value === null || value === undefined || value.trim() === '') return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Round to a fixed number of decimals and drop trailing noise. */
export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  const r = Math.round(value * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

const DEFAULT_VIEWBOX: ViewBox = { x: 0, y: 0, width: 300, height: 200 };

export function readViewBox(svg: Element): ViewBox {
  const raw = svg.getAttribute('viewBox');
  if (!raw) return DEFAULT_VIEWBOX;
  const values = raw
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (values.length !== 4 || values.some((v) => !Number.isFinite(v))) return DEFAULT_VIEWBOX;
  return { x: values[0], y: values[1], width: values[2], height: values[3] };
}

/** Element children only, in document order. */
export function elementChildren(el: Element): Element[] {
  return Array.from(el.children);
}

/** Read a property from an inline `style` attribute, if declared there. */
export function inlineStyleValue(el: Element, property: string): string | null {
  const style = el.getAttribute('style');
  if (!style) return null;
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    if (decl.slice(0, idx).trim().toLowerCase() === property) return decl.slice(idx + 1).trim();
  }
  return null;
}

/** Return the `style` attribute value with the given properties removed (null if empty). */
export function removeInlineStyleProps(
  style: string,
  properties: readonly string[],
): string | null {
  const drop = new Set(properties);
  const kept = style
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d.length > 0)
    .filter((d) => {
      const idx = d.indexOf(':');
      return idx < 0 || !drop.has(d.slice(0, idx).trim().toLowerCase());
    });
  return kept.length ? kept.join('; ') : null;
}
