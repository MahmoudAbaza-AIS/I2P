import { Injectable } from '@angular/core';
import { SymbolDefinition, SymbolDocument, SymbolElementMetadata } from '../models/symbol.model';
import { SymbolPart } from '../models/symbol-part.model';
import { SVG_NS, num, readViewBox } from '../utils/svg-dom';
import { buildBreakdown } from './symbol-breakdown.service';

export interface SymbolExport {
  readonly svg: string;
  readonly definition: SymbolDefinition;
}

/** Visit `a` and its structural twin `b` (a deep clone) in parallel. */
function parallel(a: Element, b: Element, visit: (orig: Element, copy: Element) => void): void {
  visit(a, b);
  const ac = a.children;
  const bc = b.children;
  for (let i = 0; i < ac.length; i++) parallel(ac[i], bc[i], visit);
}

function elementType(tag: string): SymbolElementMetadata['elementType'] {
  // POC mapping; 'shape' kept in the type for schema compatibility.
  return tag === 'text' ? 'text' : tag === 'g' ? 'group' : 'other';
}

function optNum(el: Element, attr: string): number | undefined {
  return el.hasAttribute(attr) ? num(el.getAttribute(attr)) : undefined;
}

function optStr(el: Element, attr: string): string | undefined {
  return el.getAttribute(attr) || undefined;
}

/**
 * Serialize the symbol and its JSON definition (POC `exportFiles` +
 * `buildDefinition`). The live document is never touched: a clone is
 * annotated with the persistent part metadata (POC-compatible attributes:
 * `data-symbol-element`, `data-name`, `data-role`, `data-locked`) and parts
 * without an `id` receive their deterministic part id.
 */
export function exportSymbol(doc: SymbolDocument, name: string, createdAt: string): SymbolExport {
  const breakdown = buildBreakdown(doc);
  const clone = doc.root.cloneNode(true) as SVGSVGElement;
  const elements: SymbolElementMetadata[] = [];
  const copies = new Map<Element, Element>();

  parallel(doc.root, clone, (orig, copy) => copies.set(orig, copy));

  for (const raw of breakdown.flat) {
    const part = { ...raw, name: raw.name.trim() };
    const copy = copies.get(breakdown.byId.get(part.id)!)!;
    annotate(copy, part);
    elements.push(describe(copy, part));
  }

  clone.setAttribute('xmlns', SVG_NS);
  const vb = readViewBox(doc.root);
  return {
    svg: new XMLSerializer().serializeToString(clone),
    definition: {
      schemaVersion: 1,
      symbolType: 'composite-svg',
      name,
      width: vb.width,
      height: vb.height,
      viewBox: `${vb.x} ${vb.y} ${vb.width} ${vb.height}`,
      svgFile: 'symbol.svg',
      elements,
      createdAt,
    },
  };
}

function annotate(el: Element, part: SymbolPart): void {
  if (!el.hasAttribute('id')) el.setAttribute('id', part.id);
  el.setAttribute('data-symbol-element', 'true');
  el.setAttribute('data-role', part.role);
  el.setAttribute('data-name', part.name);
  if (part.locked) el.setAttribute('data-locked', 'true');
  if (!part.visible) el.setAttribute('data-hidden', 'true');
}

function describe(el: Element, part: SymbolPart): SymbolElementMetadata {
  const isText = part.tag === 'text';
  return {
    id: el.getAttribute('id') ?? part.id,
    name: part.name,
    role: part.role,
    elementType: elementType(part.tag),
    parentId: part.parentId ?? undefined,
    visible: part.visible,
    locked: part.locked,
    defaultText: isText ? (el.textContent ?? '') : undefined,
    x: optNum(el, 'x'),
    y: optNum(el, 'y'),
    fontSize: optNum(el, 'font-size'),
    fill: optStr(el, 'fill'),
    stroke: optStr(el, 'stroke'),
    strokeWidth: optNum(el, 'stroke-width'),
    opacity: optNum(el, 'opacity'),
    fontFamily: optStr(el, 'font-family'),
    fontWeight: optStr(el, 'font-weight'),
    fontStyle: optStr(el, 'font-style'),
    textAnchor: optStr(el, 'text-anchor'),
  };
}

@Injectable({ providedIn: 'root' })
export class SymbolExportService {
  export(doc: SymbolDocument, name: string, createdAt = new Date().toISOString()): SymbolExport {
    return exportSymbol(doc, name, createdAt);
  }
}
