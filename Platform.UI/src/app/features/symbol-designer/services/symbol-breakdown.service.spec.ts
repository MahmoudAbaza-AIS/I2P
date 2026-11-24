import { describe, expect, it } from 'vitest';
import { REPRESENTATIVE, docFrom, readSample } from '../testing/symbol-fixtures';
import { SymbolPart } from '../models/symbol-part.model';
import { allocatePartId, buildBreakdown, defaultPartName } from './symbol-breakdown.service';

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;

const ids = (parts: readonly SymbolPart[]): string[] => parts.map((p) => p.id);

describe('symbol breakdown', () => {
  it('assigns deterministic ids: own id when unique, otherwise the index path', () => {
    const source = svg(
      '<rect id="bg"/><g><path/><circle id="bg"/></g><defs><path id="p-1-0"/></defs>',
    );
    const a = buildBreakdown(docFrom(source));
    const b = buildBreakdown(docFrom(source));
    expect(ids(a.flat)).toEqual(['bg', 'p-1', 'p-1-0-2', 'p-1-1']);
    expect(ids(b.flat)).toEqual(ids(a.flat));
  });

  it('skips defs, clipPath, mask and gradients; walks through <a>; includes <use>', () => {
    const b = buildBreakdown(
      docFrom(
        svg(
          '<defs><g><path/></g><linearGradient id="g"/></defs><clipPath id="c"><rect/></clipPath>' +
            '<mask id="m"><rect/></mask><a><rect id="linked"/></a><use href="#x" id="u"/><title>t</title>',
        ),
      ),
    );
    expect(ids(b.flat)).toEqual(['linked', 'u']);
    expect(b.flat.map((p) => p.kind)).toEqual(['shape', 'use']);
  });

  it('builds a tree in stacking order (topmost first) with depth and parent ids', () => {
    const b = buildBreakdown(
      docFrom(svg('<rect id="a"/><g id="grp"><rect id="b"/><rect id="c"/></g>')),
    );
    expect(ids(b.roots)).toEqual(['grp', 'a']);
    const grp = b.roots[0];
    expect(grp.kind).toBe('group');
    expect(ids(grp.children)).toEqual(['c', 'b']);
    expect(grp.children[0].depth).toBe(1);
    expect(grp.children[0].parentId).toBe('grp');
  });

  it('handles empty groups and nested groups', () => {
    const b = buildBreakdown(
      docFrom(svg('<g id="empty"/><g id="o"><g id="i"><path id="p"/></g></g>')),
    );
    expect(b.roots.find((p) => p.id === 'empty')!.children).toEqual([]);
    expect(b.partOf.get(b.byId.get('p')!)!.depth).toBe(2);
  });

  it('reads POC metadata attributes into the model and strips them from the DOM', () => {
    const doc = docFrom(
      svg(
        '<text id="t" data-symbol-element="true" data-role="graphic" data-name="Reading">1</text>' +
          '<rect id="r" data-role="status" data-locked="true" data-editor-base-transform="x"/>' +
          '<style data-editor-ui="selection-style">.x{}</style>',
      ),
    );
    const b = buildBreakdown(doc);
    const t = b.partOf.get(b.byId.get('t')!)!;
    const r = b.partOf.get(b.byId.get('r')!)!;
    expect([t.name, t.role]).toEqual(['Reading', 'text']); // legacy graphic → text (POC rule)
    expect([r.role, r.locked]).toEqual(['status', true]);
    expect(
      doc.root.querySelector('[data-role], [data-name], [data-locked], [data-editor-ui]'),
    ).toBeNull();
  });

  it('derives default names like the POC', () => {
    const doc = docFrom(
      svg('<text>  A very long label that keeps going on </text><rect id="x"/><path/>'),
    );
    const [text, rect, path] = Array.from(doc.root.children);
    expect(defaultPartName(text)).toBe('A very long label that ke…');
    expect(defaultPartName(rect)).toBe('x');
    expect(defaultPartName(path)).toBe('Path');
  });

  it('reports hidden parts', () => {
    const b = buildBreakdown(
      docFrom(
        svg('<rect id="a" display="none"/><rect id="b" style="display: none"/><rect id="c"/>'),
      ),
    );
    expect(b.flat.map((p) => p.visible)).toEqual([false, false, true]);
  });

  it('allocates unique session ids', () => {
    const doc = docFrom(svg('<rect id="group-1"/>'));
    expect(allocatePartId(doc, 'group')).toBe('group-2');
    expect(allocatePartId(doc, 'group')).toBe('group-3');
  });

  it.each(REPRESENTATIVE)('breaks down %s deterministically with unique ids', (file) => {
    const source = readSample(file);
    const a = buildBreakdown(docFrom(source));
    const b = buildBreakdown(docFrom(source));
    expect(a.flat.length).toBeGreaterThan(0);
    expect(ids(b.flat)).toEqual(ids(a.flat));
    expect(new Set(ids(a.flat)).size).toBe(a.flat.length);
  });
});
