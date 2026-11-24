import { Injectable } from '@angular/core';
import { EditOp, SymbolCommand } from '../models/symbol-command.model';
import {
  EditTransform,
  PartMeta,
  SymbolElementRole,
  TextPlaceholderRole,
} from '../models/symbol-part.model';
import { SymbolDocument } from '../models/symbol.model';
import { toHexColor } from '../utils/color';
import {
  GAUGE_TAGS,
  POSITIONED_TAGS,
  STYLABLE_TAGS,
  SVG_NS,
  clamp,
  inlineStyleValue,
  num,
  readViewBox,
  removeInlineStyleProps,
  round,
} from '../utils/svg-dom';
import {
  applyToPoint,
  composeTransform,
  isIdentityEdit,
  normalizeEdit,
  parseTransform,
} from '../utils/transform';
import {
  allocatePartId,
  hasLockedAncestor,
  isElementVisible,
  newMeta,
} from './symbol-breakdown.service';
import { revertCommand } from './symbol-history.service';

/** Geometry provided by the live canvas (jsdom has none, so tests inject a fake). */
export interface SymbolGeometry {
  /** Bounding box in the element's own user space (SVG `getBBox()`), or null. */
  localBBox(el: Element): { x: number; y: number; width: number; height: number } | null;
}

export const NO_GEOMETRY: SymbolGeometry = { localBBox: () => null };

export interface StylePatch {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  textAnchor?: string;
  textDecoration?: string;
}

const STYLE_ATTR: Readonly<Record<keyof StylePatch, string>> = {
  fill: 'fill',
  stroke: 'stroke',
  strokeWidth: 'stroke-width',
  opacity: 'opacity',
  fontSize: 'font-size',
  fontFamily: 'font-family',
  fontWeight: 'font-weight',
  fontStyle: 'font-style',
  textAnchor: 'text-anchor',
  textDecoration: 'text-decoration',
};

const TEXT_ONLY: ReadonlySet<keyof StylePatch> = new Set([
  'fontSize',
  'fontFamily',
  'fontWeight',
  'fontStyle',
  'textAnchor',
  'textDecoration',
]);

/** Presentation attributes copied to children on ungroup when the child lacks them. */
const INHERITED_ATTRS = [
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
];

/** Root children kept outside `#symbol-content` (POC `groupAsSymbol`). */
const PRESERVED_ROOT_TAGS = new Set(['defs', 'title', 'desc', 'style', 'metadata']);

export const SYMBOL_CONTENT_ID = 'symbol-content';

/**
 * Applies ops live while recording them, then reverts. The returned command is
 * therefore guaranteed to replay exactly (insert positions are captured from the
 * real intermediate states, not predicted).
 */
class OpRecorder {
  readonly ops: EditOp[] = [];
  constructor(private readonly doc: SymbolDocument) {}

  attr(el: Element, name: string, value: string | null): void {
    const before = el.getAttribute(name);
    if (before === value) return;
    this.ops.push({ kind: 'attr', el, name, before, after: value });
    if (value === null) el.removeAttribute(name);
    else el.setAttribute(name, value);
  }

  text(el: Element, value: string): void {
    const before = el.textContent ?? '';
    if (before === value) return;
    this.ops.push({ kind: 'text', el, before, after: value });
    el.textContent = value;
  }

  meta(el: Element, value: PartMeta): void {
    const before = this.doc.meta.get(el) ?? null;
    this.ops.push({ kind: 'meta', el, before, after: value });
    this.doc.meta.set(el, value);
  }

  move(node: Element, toParent: Element | null, toNext: Node | null): void {
    this.ops.push({
      kind: 'node',
      node,
      fromParent: node.parentElement,
      fromNext: node.nextSibling,
      toParent,
      toNext,
    });
    if (toParent) toParent.insertBefore(node, toNext);
    else node.remove();
  }

  finish(extra: Omit<SymbolCommand, 'ops'> = {}): SymbolCommand | null {
    const cmd: SymbolCommand = { ops: this.ops, ...extra };
    revertCommand(this.doc, cmd);
    return this.ops.length ? cmd : null;
  }
}

function metaOf(doc: SymbolDocument, el: Element): PartMeta {
  const m = doc.meta.get(el);
  if (!m) throw new Error('Element is not a part of this symbol');
  return m;
}

/** Set an attribute and drop the same property from inline `style` so the edit is visible. */
function setPresentation(rec: OpRecorder, el: Element, attr: string, value: string | null): void {
  rec.attr(el, attr, value);
  const style = el.getAttribute('style');
  if (style && inlineStyleValue(el, attr) !== null) {
    rec.attr(el, 'style', removeInlineStyleProps(style, [attr]));
  }
}

function sortByDocumentOrder(els: Element[]): Element[] {
  // DOCUMENT_POSITION_FOLLOWING = 4
  return els.slice().sort((a, b) => (a === b ? 0 : a.compareDocumentPosition(b) & 4 ? -1 : 1));
}

/** Keep only elements with no selected ancestor (POC delete rule). */
function topMost(els: Element[]): Element[] {
  return els.filter((el) => !els.some((other) => other !== el && other.contains(el)));
}

// ── Read side ──────────────────────────────────────────────────────────────

export interface PartProperties {
  readonly tag: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly opacity: number;
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly fontWeight: string;
  readonly fontStyle: string;
  readonly textAnchor: string;
  readonly textDecoration: string;
  readonly transform: EditTransform;
  readonly gaugePercent: number;
  readonly gaugeColor: string;
  readonly gaugeApplicable: boolean;
}

function presentation(el: Element, attr: string): string | null {
  return inlineStyleValue(el, attr) ?? el.getAttribute(attr);
}

/** Current editable values of a part (POC `readPrimarySelection`, same defaults). */
export function readProperties(doc: SymbolDocument, el: Element): PartProperties {
  const m = metaOf(doc, el);
  return {
    tag: el.localName,
    text: el.textContent ?? '',
    x: num(el.getAttribute('x')),
    y: num(el.getAttribute('y')),
    fill: toHexColor(presentation(el, 'fill'), '#1f2937'),
    stroke: toHexColor(presentation(el, 'stroke'), '#000000'),
    strokeWidth: num(presentation(el, 'stroke-width')),
    opacity: presentation(el, 'opacity') !== null ? num(presentation(el, 'opacity')) : 1,
    fontSize: num(presentation(el, 'font-size')) || 16,
    fontFamily: presentation(el, 'font-family') || 'Arial, sans-serif',
    fontWeight: presentation(el, 'font-weight') || 'normal',
    fontStyle: presentation(el, 'font-style') || 'normal',
    textAnchor: presentation(el, 'text-anchor') || 'start',
    textDecoration: presentation(el, 'text-decoration') || 'none',
    transform: m.editTransform,
    gaugePercent: el.hasAttribute('data-gauge-progress')
      ? num(el.getAttribute('data-gauge-progress'))
      : 50,
    gaugeColor: toHexColor(el.getAttribute('stroke'), '#16a34a'),
    gaugeApplicable: GAUGE_TAGS.has(el.localName),
  };
}

export function canGroup(els: readonly Element[]): boolean {
  return els.length >= 2 && els.every((el) => el.parentElement === els[0].parentElement);
}

export function canUngroup(els: readonly Element[]): boolean {
  return els.length === 1 && els[0].localName === 'g';
}

export function canGroupAll(doc: SymbolDocument): boolean {
  return !Array.from(doc.root.children).some((c) => c.getAttribute('id') === SYMBOL_CONTENT_ID);
}

/** Group effects that cannot be folded into children; ungrouping would lose them. */
export function ungroupBlocker(el: Element): string | null {
  for (const attr of ['clip-path', 'mask', 'filter']) {
    if (el.hasAttribute(attr) || inlineStyleValue(el, attr) !== null) return attr;
  }
  return null;
}

// ── Write side: each function returns a command (not yet applied) or null ───

export function setStyle(
  doc: SymbolDocument,
  els: readonly Element[],
  patch: StylePatch,
  applyToChildren: boolean,
): SymbolCommand | null {
  const rec = new OpRecorder(doc);
  for (const el of els) {
    const targets: Element[] = [el];
    if (el.localName === 'g' && applyToChildren) {
      targets.push(
        ...Array.from(el.querySelectorAll('*')).filter((n) => STYLABLE_TAGS.has(n.localName)),
      );
    }
    for (const target of targets) {
      for (const key of Object.keys(patch) as (keyof StylePatch)[]) {
        const value = patch[key];
        if (value === undefined) continue;
        if (TEXT_ONLY.has(key) && target.localName !== 'text') continue;
        if (key === 'strokeWidth') {
          const width = clamp(Number(value), 0, 50);
          if (width > 0) {
            setPresentation(rec, target, 'stroke-width', String(width));
            const stroke = presentation(target, 'stroke');
            if (!stroke || stroke === 'none')
              setPresentation(rec, target, 'stroke', patch.stroke ?? '#000000');
          } else {
            // POC: a zero border width removes the stroke entirely.
            setPresentation(rec, target, 'stroke', null);
            setPresentation(rec, target, 'stroke-width', null);
          }
        } else if (key === 'opacity') {
          setPresentation(rec, target, 'opacity', String(clamp(Number(value), 0, 1)));
        } else if (key === 'fontSize') {
          setPresentation(rec, target, 'font-size', String(Math.max(1, Number(value))));
        } else if (key === 'stroke' && patch.strokeWidth === 0) {
          continue;
        } else {
          setPresentation(rec, target, STYLE_ATTR[key], String(value));
        }
      }
    }
  }
  const keys = Object.keys(patch).sort().join(',');
  return rec.finish({ mergeKey: `style:${els.map((e) => metaOf(doc, e).id).join(',')}:${keys}` });
}

export function setText(doc: SymbolDocument, el: Element, text: string): SymbolCommand | null {
  if (el.localName !== 'text') return null;
  const rec = new OpRecorder(doc);
  rec.text(el, text);
  return rec.finish({ mergeKey: `text:${metaOf(doc, el).id}` });
}

export function setPosition(
  doc: SymbolDocument,
  el: Element,
  x: number,
  y: number,
): SymbolCommand | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const rec = new OpRecorder(doc);
  rec.attr(el, 'x', String(round(x, 3)));
  rec.attr(el, 'y', String(round(y, 3)));
  return rec.finish({ mergeKey: `pos:${metaOf(doc, el).id}` });
}

export function rename(doc: SymbolDocument, el: Element, name: string): SymbolCommand | null {
  const m = metaOf(doc, el);
  // Keep the raw value while typing (trimming live would eat spaces in the input);
  // the exporter trims. A blank name falls back to the default name.
  const next = name.trim() ? name : null;
  if (next === m.name) return null;
  const rec = new OpRecorder(doc);
  rec.meta(el, { ...m, name: next });
  return rec.finish({ mergeKey: `name:${m.id}` });
}

export function setRole(
  doc: SymbolDocument,
  el: Element,
  role: SymbolElementRole,
): SymbolCommand | null {
  const m = metaOf(doc, el);
  if (m.role === role) return null;
  const rec = new OpRecorder(doc);
  rec.meta(el, { ...m, role });
  return rec.finish();
}

export function toggleLock(doc: SymbolDocument, el: Element): SymbolCommand | null {
  const m = metaOf(doc, el);
  const rec = new OpRecorder(doc);
  rec.meta(el, { ...m, locked: !m.locked });
  return rec.finish({
    status: { key: m.locked ? 'symbolDesigner.status.unlocked' : 'symbolDesigner.status.locked' },
  });
}

export function toggleVisibility(doc: SymbolDocument, el: Element): SymbolCommand | null {
  const rec = new OpRecorder(doc);
  if (isElementVisible(el)) {
    rec.attr(el, 'display', 'none');
  } else {
    rec.attr(el, 'display', null);
    const style = el.getAttribute('style');
    if (style && inlineStyleValue(el, 'display') !== null) {
      rec.attr(el, 'style', removeInlineStyleProps(style, ['display']));
    }
  }
  return rec.finish();
}

/** Bake a new editor transform for one element (meta + `transform` attribute). */
function writeTransform(
  rec: OpRecorder,
  doc: SymbolDocument,
  el: Element,
  edit: EditTransform,
  geometry: SymbolGeometry,
): void {
  const m = metaOf(doc, el);
  // '' = captured, element had no original transform; null = not captured yet.
  const base = m.baseTransform ?? el.getAttribute('transform') ?? '';
  let pivot = m.pivot;
  if (!pivot && (edit.rotation !== 0 || edit.scaleX !== 1 || edit.scaleY !== 1)) {
    const box = geometry.localBBox(el);
    if (box)
      pivot = applyToPoint(parseTransform(base), box.x + box.width / 2, box.y + box.height / 2);
  }
  rec.meta(el, { ...m, baseTransform: base, editTransform: edit, pivot });
  rec.attr(
    el,
    'transform',
    isIdentityEdit(edit) ? base || null : composeTransform(edit, base, pivot),
  );
}

export function setTransform(
  doc: SymbolDocument,
  el: Element,
  patch: Partial<EditTransform>,
  geometry: SymbolGeometry,
): SymbolCommand | null {
  const m = metaOf(doc, el);
  const edit = normalizeEdit(patch, m.editTransform);
  const rec = new OpRecorder(doc);
  writeTransform(rec, doc, el, edit, geometry);
  return rec.finish({ mergeKey: `transform:${m.id}:${Object.keys(patch).sort().join(',')}` });
}

/**
 * Move parts by a delta in each element's parent coordinate space (POC drag).
 * Elements positioned by x/y (and with no transform) move by attributes;
 * everything else moves through the editor translate. Locked parts are skipped.
 */
export function moveParts(
  doc: SymbolDocument,
  deltas: ReadonlyMap<Element, { dx: number; dy: number }>,
  mergeKey: string,
  geometry: SymbolGeometry = NO_GEOMETRY,
): SymbolCommand | null {
  const rec = new OpRecorder(doc);
  for (const el of topMost([...deltas.keys()])) {
    if (hasLockedAncestor(el, doc)) continue;
    const { dx, dy } = deltas.get(el)!;
    const m = metaOf(doc, el);
    const byAttributes =
      POSITIONED_TAGS.has(el.localName) &&
      el.hasAttribute('x') &&
      el.hasAttribute('y') &&
      !el.hasAttribute('transform') &&
      isIdentityEdit(m.editTransform);
    if (byAttributes) {
      rec.attr(el, 'x', String(round(num(el.getAttribute('x')) + dx, 3)));
      rec.attr(el, 'y', String(round(num(el.getAttribute('y')) + dy, 3)));
    } else {
      const t = m.editTransform;
      writeTransform(
        rec,
        doc,
        el,
        { ...t, translateX: round(t.translateX + dx, 3), translateY: round(t.translateY + dy, 3) },
        geometry,
      );
    }
  }
  return rec.finish({ mergeKey });
}

export function deleteParts(doc: SymbolDocument, els: readonly Element[]): SymbolCommand | null {
  const roots = topMost([...els]);
  if (!roots.length) return null;
  const rec = new OpRecorder(doc);
  roots.forEach((el) => rec.move(el, null, null));
  return rec.finish({
    selectAfter: [],
    status: { key: 'symbolDesigner.status.deleted', params: { count: roots.length } },
  });
}

/** POC `moveLayer`: 'up' = bring forward one step, 'down' = send backward one step. */
export function moveZ(
  doc: SymbolDocument,
  el: Element,
  direction: 'up' | 'down',
): SymbolCommand | null {
  const parent = el.parentElement;
  if (!parent) return null;
  const rec = new OpRecorder(doc);
  if (direction === 'up') {
    const next = el.nextElementSibling;
    if (!next) return null;
    rec.move(next, parent, el);
  } else {
    const prev = el.previousElementSibling;
    if (!prev) return null;
    rec.move(el, parent, prev);
  }
  return rec.finish();
}

function createGroup(doc: SymbolDocument, rec: OpRecorder, id: string, name: string): Element {
  const group = doc.root.ownerDocument.createElementNS(SVG_NS, 'g');
  if (id === SYMBOL_CONTENT_ID) group.setAttribute('id', id);
  rec.meta(group, newMeta(id, { name }));
  return group;
}

export function groupParts(
  doc: SymbolDocument,
  els: readonly Element[],
  name: string,
): SymbolCommand | null {
  if (!canGroup(els)) return null;
  const nodes = sortByDocumentOrder([...els]);
  const parent = nodes[0].parentElement!;
  const rec = new OpRecorder(doc);
  const id = allocatePartId(doc, 'group');
  const group = createGroup(doc, rec, id, name);
  rec.move(group, parent, nodes[0]);
  nodes.forEach((n) => rec.move(n, group, null));
  return rec.finish({
    selectAfter: [id],
    status: { key: 'symbolDesigner.status.grouped', params: { count: nodes.length } },
  });
}

/**
 * Ungroup (POC), additionally folding the group's transform and inherited
 * presentation attributes into the children so the artwork does not change.
 * Children's editor transforms are baked into their `transform` attribute.
 */
export function ungroup(doc: SymbolDocument, group: Element): SymbolCommand | null {
  if (group.localName !== 'g' || !group.parentElement || ungroupBlocker(group)) return null;
  const parent = group.parentElement;
  const groupTransform = group.getAttribute('transform');
  const groupOpacity = group.hasAttribute('opacity') ? num(group.getAttribute('opacity')) : 1;
  const rec = new OpRecorder(doc);
  const children = Array.from(group.children);
  for (const child of children) {
    if (groupTransform) {
      const own = child.getAttribute('transform');
      rec.attr(child, 'transform', own ? `${groupTransform} ${own}` : groupTransform);
      const cm = doc.meta.get(child);
      if (cm && (cm.baseTransform !== null || !isIdentityEdit(cm.editTransform))) {
        rec.meta(child, {
          ...cm,
          baseTransform: null,
          editTransform: newMeta('').editTransform,
          pivot: null,
        });
      }
    }
    for (const attr of INHERITED_ATTRS) {
      const value = group.getAttribute(attr);
      if (value !== null && !child.hasAttribute(attr) && inlineStyleValue(child, attr) === null) {
        rec.attr(child, attr, value);
      }
    }
    if (groupOpacity !== 1) {
      const own = child.hasAttribute('opacity') ? num(child.getAttribute('opacity')) : 1;
      rec.attr(child, 'opacity', String(round(own * groupOpacity, 4)));
    }
    rec.move(child, parent, group);
  }
  rec.move(group, null, null);
  return rec.finish({
    selectAfter: children.filter((c) => doc.meta.has(c)).map((c) => doc.meta.get(c)!.id),
    status: { key: 'symbolDesigner.status.ungrouped' },
  });
}

/** POC `groupAsSymbol`: wrap all artwork into `#symbol-content`. */
export function groupAll(doc: SymbolDocument, name: string): SymbolCommand | null {
  if (!canGroupAll(doc)) return null;
  const movable = Array.from(doc.root.children).filter(
    (c) => !PRESERVED_ROOT_TAGS.has(c.localName),
  );
  if (!movable.length) return null;
  const rec = new OpRecorder(doc);
  const group = createGroup(doc, rec, SYMBOL_CONTENT_ID, name);
  rec.move(group, doc.root, null);
  movable.forEach((n) => rec.move(n, group, null));
  return rec.finish({
    selectAfter: [SYMBOL_CONTENT_ID],
    status: { key: 'symbolDesigner.status.groupedAll' },
  });
}

/** POC `createText`: a centred text placeholder for a semantic role. */
export function addText(
  doc: SymbolDocument,
  role: TextPlaceholderRole,
  text: string,
  name: string,
): SymbolCommand | null {
  const vb = readViewBox(doc.root);
  const el = doc.root.ownerDocument.createElementNS(SVG_NS, 'text');
  const id = allocatePartId(doc, role);
  el.setAttribute('x', String(round(vb.x + vb.width / 2, 3)));
  el.setAttribute('y', String(round(vb.y + vb.height / 2, 3)));
  el.setAttribute('text-anchor', 'middle');
  el.setAttribute('font-size', String(round(Math.max(12, vb.width / 18), 2)));
  el.setAttribute('fill', '#1f2937');
  el.textContent = text;
  const container =
    Array.from(doc.root.children).find((c) => c.getAttribute('id') === SYMBOL_CONTENT_ID) ??
    doc.root;
  const rec = new OpRecorder(doc);
  rec.meta(el, newMeta(id, { role, name }));
  rec.move(el, container, null);
  return rec.finish({
    selectAfter: [id],
    status: { key: 'symbolDesigner.status.added', params: { name } },
  });
}

/** POC `applyGaugeProgress`: draw `percent` of the path from its start. */
export function applyGauge(
  doc: SymbolDocument,
  el: Element,
  percent: number,
  color: string,
): SymbolCommand | null {
  if (!GAUGE_TAGS.has(el.localName)) return null;
  const p = Math.round(clamp(percent, 0, 100));
  const rec = new OpRecorder(doc);
  rec.attr(el, 'pathLength', '100');
  setPresentation(rec, el, 'stroke', color);
  setPresentation(rec, el, 'stroke-dasharray', `${p} ${100 - p}`);
  setPresentation(rec, el, 'stroke-dashoffset', '0');
  setPresentation(rec, el, 'fill', 'none');
  rec.attr(el, 'data-gauge-progress', String(p));
  setPresentation(rec, el, 'stroke-linecap', 'round');
  return rec.finish({
    mergeKey: `gauge:${metaOf(doc, el).id}`,
    status: { key: 'symbolDesigner.status.gaugeApplied', params: { percent: p } },
  });
}

export function clearGauge(doc: SymbolDocument, el: Element): SymbolCommand | null {
  const rec = new OpRecorder(doc);
  for (const attr of [
    'pathLength',
    'stroke-dasharray',
    'stroke-dashoffset',
    'data-gauge-progress',
  ]) {
    rec.attr(el, attr, null);
  }
  return rec.finish({ status: { key: 'symbolDesigner.status.gaugeCleared' } });
}

/** Injectable façade so components depend on a service, not free functions. */
@Injectable({ providedIn: 'root' })
export class SymbolEditService {
  readonly readProperties = readProperties;
  readonly canGroup = canGroup;
  readonly canUngroup = canUngroup;
  readonly canGroupAll = canGroupAll;
  readonly ungroupBlocker = ungroupBlocker;
  readonly setStyle = setStyle;
  readonly setText = setText;
  readonly setPosition = setPosition;
  readonly rename = rename;
  readonly setRole = setRole;
  readonly toggleLock = toggleLock;
  readonly toggleVisibility = toggleVisibility;
  readonly setTransform = setTransform;
  readonly moveParts = moveParts;
  readonly deleteParts = deleteParts;
  readonly moveZ = moveZ;
  readonly groupParts = groupParts;
  readonly ungroup = ungroup;
  readonly groupAll = groupAll;
  readonly addText = addText;
  readonly applyGauge = applyGauge;
  readonly clearGauge = clearGauge;
}
