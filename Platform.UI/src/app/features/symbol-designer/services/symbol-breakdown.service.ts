import { Injectable } from '@angular/core';
import {
  IDENTITY_EDIT_TRANSFORM,
  PartMeta,
  SYMBOL_ROLES,
  SymbolElementRole,
  SymbolPart,
} from '../models/symbol-part.model';
import { SymbolDocument } from '../models/symbol.model';
import {
  PART_TAGS,
  TRANSPARENT_TAGS,
  elementChildren,
  inlineStyleValue,
  partKind,
} from '../utils/svg-dom';

/**
 * Editor attributes written by the POC (and by our exporter). On import they
 * are read into the model and removed from the DOM, so editor state never
 * lives inside the symbol (rule 3c / log D6).
 */
export const EDITOR_ATTRIBUTES: readonly string[] = [
  'data-symbol-element',
  'data-role',
  'data-name',
  'data-locked',
  'data-hidden',
  'data-editor-selected',
  'data-editor-selected-group',
  'data-editor-base-transform',
  'data-editor-offset-x',
  'data-editor-offset-y',
  'data-drag-start-transform',
  'data-drag-start-x',
  'data-drag-start-y',
];

export interface BreakdownResult {
  /** Top-level parts, topmost (last painted) first. */
  readonly roots: readonly SymbolPart[];
  /** All parts in document (paint) order. */
  readonly flat: readonly SymbolPart[];
  readonly byId: ReadonlyMap<string, Element>;
  readonly partOf: ReadonlyMap<Element, SymbolPart>;
}

type Visit = (el: Element, parentPart: Element | null, path: readonly number[]) => void;

/**
 * Walk the part elements of an SVG in document order. `g` and the POC's shape
 * tags are parts; `a`/`switch` are walked through; everything else
 * (defs, clipPath, mask, gradients, filters, title, ...) is skipped entirely.
 */
export function walkParts(root: Element, visit: Visit): void {
  const walk = (container: Element, path: readonly number[], parentPart: Element | null) => {
    elementChildren(container).forEach((child, index) => {
      const childPath = [...path, index];
      const tag = child.localName;
      if (PART_TAGS.has(tag)) {
        visit(child, parentPart, childPath);
        if (tag === 'g') walk(child, childPath, child);
      } else if (TRANSPARENT_TAGS.has(tag)) {
        walk(child, childPath, parentPart);
      }
    });
  };
  walk(root, [], null);
}

function isRole(value: string | null): value is SymbolElementRole {
  return value !== null && (SYMBOL_ROLES as readonly string[]).includes(value);
}

function initialRole(el: Element): SymbolElementRole {
  const role = el.getAttribute('data-role');
  // POC rule: legacy exports stored data-role="graphic" on <text>; text is always text-capable.
  if (el.localName === 'text' && (role === null || role === 'graphic')) return 'text';
  return isRole(role) ? role : 'graphic';
}

export function newMeta(id: string, overrides: Partial<PartMeta> = {}): PartMeta {
  return {
    id,
    name: null,
    role: 'graphic',
    locked: false,
    baseTransform: null,
    editTransform: IDENTITY_EDIT_TRANSFORM,
    pivot: null,
    ...overrides,
  };
}

/** Default display name (POC `defaultLayerName`, minus the random id). */
export function defaultPartName(el: Element): string {
  const tag = el.localName;
  if (tag === 'text') {
    const content = (el.textContent ?? '').trim();
    if (content) return content.length > 28 ? content.slice(0, 25) + '…' : content;
  }
  const id = el.getAttribute('id');
  return id || tag[0].toUpperCase() + tag.slice(1);
}

export function isElementVisible(el: Element): boolean {
  return el.getAttribute('display') !== 'none' && inlineStyleValue(el, 'display') !== 'none';
}

/**
 * Build a SymbolDocument from a sanitized root: assign deterministic part ids,
 * pull POC/exported editor attributes into metadata and strip them from the DOM.
 *
 * Ids: the element's own `id` when unique, otherwise `p-<index path>` (e.g.
 * `p-2-0-1`). Same input → same ids, every run (log D5).
 */
export function createSymbolDocument(root: SVGSVGElement): SymbolDocument {
  // The POC injected a selection <style data-editor-ui>; drop it if a POC export is re-imported.
  Array.from(root.querySelectorAll('[data-editor-ui]')).forEach((n) => n.remove());

  const idCount = new Map<string, number>();
  for (const el of Array.from(root.querySelectorAll('[id]'))) {
    const id = el.getAttribute('id') ?? '';
    idCount.set(id, (idCount.get(id) ?? 0) + 1);
  }
  const claimed = new Set<string>(idCount.keys());
  const meta = new Map<Element, PartMeta>();
  const ownIdTaken = new Set<string>();

  walkParts(root, (el, _parent, path) => {
    const own = el.getAttribute('id');
    let id: string;
    if (own && !ownIdTaken.has(own)) {
      id = own;
      ownIdTaken.add(own);
    } else {
      const base = `p-${path.join('-')}`;
      id = base;
      for (let n = 2; claimed.has(id); n++) id = `${base}-${n}`;
      claimed.add(id);
    }
    meta.set(
      el,
      newMeta(id, {
        name: el.getAttribute('data-name')?.trim() || null,
        role: initialRole(el),
        locked: el.getAttribute('data-locked') === 'true',
      }),
    );
  });

  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const attr of EDITOR_ATTRIBUTES) el.removeAttribute(attr);
  }
  return { root, meta, nextCreatedId: 1 };
}

/** Allocate an id for a part created in this session (deterministic counter). */
export function allocatePartId(doc: SymbolDocument, prefix: string): string {
  const used = new Set<string>();
  for (const m of doc.meta.values()) used.add(m.id);
  for (const el of Array.from(doc.root.querySelectorAll('[id]')))
    used.add(el.getAttribute('id') ?? '');
  let id = `${prefix}-${doc.nextCreatedId++}`;
  while (used.has(id)) id = `${prefix}-${doc.nextCreatedId++}`;
  return id;
}

/** Build the immutable part tree from the current DOM + metadata. O(n). */
export function buildBreakdown(doc: SymbolDocument): BreakdownResult {
  const flat: SymbolPart[] = [];
  const byId = new Map<string, Element>();
  const partOf = new Map<Element, SymbolPart>();
  const childrenOf = new Map<Element | null, SymbolPart[]>();

  // Parts are created bottom-up after the walk so children arrays can be frozen.
  const order: { el: Element; parent: Element | null; depth: number }[] = [];
  const depthOf = new Map<Element, number>();
  walkParts(doc.root, (el, parent) => {
    const depth = parent ? (depthOf.get(parent) ?? 0) + 1 : 0;
    depthOf.set(el, depth);
    order.push({ el, parent, depth });
    if (!doc.meta.has(el))
      doc.meta.set(el, newMeta(allocatePartId(doc, 'part'), { role: initialRole(el) }));
  });

  for (let i = order.length - 1; i >= 0; i--) {
    const { el, parent, depth } = order[i];
    const m = doc.meta.get(el)!;
    const kids = (childrenOf.get(el) ?? []).slice();
    const part: SymbolPart = {
      id: m.id,
      name: m.name ?? defaultPartName(el),
      tag: el.localName,
      kind: partKind(el.localName),
      role: m.role,
      visible: isElementVisible(el),
      locked: m.locked,
      depth,
      parentId: parent ? doc.meta.get(parent)!.id : null,
      // `order` is document order; iterating backwards pushes topmost first.
      children: kids,
    };
    partOf.set(el, part);
    byId.set(part.id, el);
    const siblings = childrenOf.get(parent) ?? [];
    siblings.push(part);
    childrenOf.set(parent, siblings);
  }
  for (const { el } of order) flat.push(partOf.get(el)!);
  return { roots: childrenOf.get(null) ?? [], flat, byId, partOf };
}

/** Nearest ancestor-or-self element that is a part. */
export function closestPart(
  start: Element | null,
  partOf: ReadonlyMap<Element, SymbolPart>,
  stopAt: Element,
): Element | null {
  for (let el = start; el && el !== stopAt; el = el.parentElement) {
    if (partOf.has(el)) return el;
  }
  return null;
}

/** POC `hasLockedAncestor`: self or any ancestor part locked. */
export function hasLockedAncestor(el: Element, doc: SymbolDocument): boolean {
  for (let cur: Element | null = el; cur && cur !== doc.root; cur = cur.parentElement) {
    if (doc.meta.get(cur)?.locked) return true;
  }
  return false;
}

@Injectable({ providedIn: 'root' })
export class SymbolBreakdownService {
  createDocument(root: SVGSVGElement): SymbolDocument {
    return createSymbolDocument(root);
  }

  build(doc: SymbolDocument): BreakdownResult {
    return buildBreakdown(doc);
  }
}
