import { describe, expect, it } from 'vitest';
import { SymbolCommand } from '../models/symbol-command.model';
import { SymbolDocument } from '../models/symbol.model';
import { docFrom, fakeGeometry, fingerprint, readSample } from '../testing/symbol-fixtures';
import { buildBreakdown } from './symbol-breakdown.service';
import * as edit from './symbol-edit.service';
import { SymbolHistoryService } from './symbol-history.service';

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">${body}</svg>`;

function setup(body: string) {
  const doc = docFrom(svg(body));
  const history = new SymbolHistoryService();
  const el = (id: string) => buildBreakdown(doc).byId.get(id)!;
  const run = (cmd: SymbolCommand | null) => {
    expect(cmd).not.toBeNull();
    history.execute(doc, cmd!);
  };
  return { doc, history, el, run };
}

/** Execute, undo (must restore exactly) and redo (must match the first result). */
function roundTrip(
  doc: SymbolDocument,
  history: SymbolHistoryService,
  cmd: SymbolCommand | null,
): void {
  expect(cmd).not.toBeNull();
  const before = fingerprint(doc.root);
  history.execute(doc, cmd!);
  const after = fingerprint(doc.root);
  history.undo(doc);
  expect(fingerprint(doc.root)).toBe(before);
  history.redo(doc);
  expect(fingerprint(doc.root)).toBe(after);
}

describe('symbol edit commands', () => {
  it('sets fill/stroke/opacity and strips conflicting inline style', () => {
    const { doc, history, el } = setup(
      '<rect id="r" style="fill: red; mix-blend-mode: multiply"/>',
    );
    const cmd = edit.setStyle(doc, [el('r')], { fill: '#00ff00', opacity: 3 }, false);
    roundTrip(doc, history, cmd);
    expect(el('r').getAttribute('fill')).toBe('#00ff00');
    expect(el('r').getAttribute('opacity')).toBe('1');
    expect(el('r').getAttribute('style')).toBe('mix-blend-mode: multiply');
  });

  it('removes the stroke when the border width is 0 (POC rule)', () => {
    const { doc, run, el } = setup('<rect id="r" stroke="#000" stroke-width="2"/>');
    run(edit.setStyle(doc, [el('r')], { strokeWidth: 0 }, false));
    expect(el('r').hasAttribute('stroke')).toBe(false);
    expect(el('r').hasAttribute('stroke-width')).toBe(false);
    run(edit.setStyle(doc, [el('r')], { strokeWidth: 3 }, false));
    expect(el('r').getAttribute('stroke')).toBe('#000000');
  });

  it('applies group appearance to children when requested; font props only on text', () => {
    const { doc, run, el } = setup('<g id="g"><rect id="r"/><text id="t">x</text></g>');
    run(edit.setStyle(doc, [el('g')], { fill: '#111111', fontSize: 20 }, true));
    expect(el('r').getAttribute('fill')).toBe('#111111');
    expect(el('t').getAttribute('fill')).toBe('#111111');
    expect(el('t').getAttribute('font-size')).toBe('20');
    expect(el('r').hasAttribute('font-size')).toBe(false);
  });

  it('edits text content and position', () => {
    const { doc, history, el } = setup('<text id="t" x="1" y="2">75.5</text>');
    roundTrip(doc, history, edit.setText(doc, el('t'), '82.3'));
    expect(el('t').textContent).toBe('82.3');
    roundTrip(doc, history, edit.setPosition(doc, el('t'), 10, 20));
    expect([el('t').getAttribute('x'), el('t').getAttribute('y')]).toEqual(['10', '20']);
  });

  it('renames, sets role and locks through metadata only', () => {
    const { doc, run, el, history } = setup('<rect id="r"/>');
    const before = fingerprint(doc.root);
    run(edit.rename(doc, el('r'), '  Pump 01  '));
    run(edit.setRole(doc, el('r'), 'status'));
    run(edit.toggleLock(doc, el('r')));
    const part = buildBreakdown(doc).partOf.get(el('r'))!;
    // Raw while editing (so the input keeps spaces as typed); trimmed on export.
    expect([part.name, part.role, part.locked]).toEqual(['  Pump 01  ', 'status', true]);
    expect(edit.rename(doc, el('r'), '   ')).not.toBeNull(); // blank → default name
    expect(fingerprint(doc.root)).toBe(before); // DOM untouched (log D6)
    history.undo(doc);
    expect(buildBreakdown(doc).partOf.get(el('r'))!.locked).toBe(false);
  });

  it('toggles visibility', () => {
    const { doc, history, el } = setup('<rect id="r"/><rect id="s" style="display:none"/>');
    roundTrip(doc, history, edit.toggleVisibility(doc, el('r')));
    expect(el('r').getAttribute('display')).toBe('none');
    roundTrip(doc, history, edit.toggleVisibility(doc, el('s')));
    expect(el('s').hasAttribute('style')).toBe(false);
  });

  it('composes transforms on top of the original, pivoting on the part centre', () => {
    const { doc, history, el } = setup(
      '<rect id="r" x="0" y="0" width="10" height="20" transform="translate(5 5)"/>',
    );
    roundTrip(doc, history, edit.setTransform(doc, el('r'), { rotation: 90 }, fakeGeometry));
    expect(el('r').getAttribute('transform')).toBe(
      'translate(10 15) rotate(90) translate(-10 -15) translate(5 5)',
    );
    history.execute(doc, edit.setTransform(doc, el('r'), { rotation: 0 }, fakeGeometry)!);
    expect(el('r').getAttribute('transform')).toBe('translate(5 5)');
  });

  it('clamps scale like the POC', () => {
    const { doc, run, el } = setup('<rect id="r" width="10" height="10"/>');
    run(edit.setTransform(doc, el('r'), { scaleX: 100, scaleY: 0 }, fakeGeometry));
    const m = doc.meta.get(el('r'))!;
    expect([m.editTransform.scaleX, m.editTransform.scaleY]).toEqual([20, 0.05]);
  });

  it('moves by x/y when positioned, otherwise by translate; skips locked parts; merges a drag', () => {
    const { doc, history, el, run } = setup(
      '<text id="t" x="1" y="1">a</text><path id="p" d="M0 0"/><rect id="l" x="0" y="0"/>',
    );
    run(edit.toggleLock(doc, el('l')));
    const deltas = new Map([
      [el('t'), { dx: 2, dy: 3 }],
      [el('p'), { dx: 2, dy: 3 }],
      [el('l'), { dx: 2, dy: 3 }],
    ]);
    history.execute(doc, edit.moveParts(doc, deltas, 'drag-1')!);
    history.execute(doc, edit.moveParts(doc, deltas, 'drag-1')!);
    expect([el('t').getAttribute('x'), el('t').getAttribute('y')]).toEqual(['5', '7']);
    expect(el('p').getAttribute('transform')).toBe('translate(4 6)');
    expect(el('l').getAttribute('x')).toBe('0');
    history.undo(doc); // one step undoes the whole drag
    expect(el('t').getAttribute('x')).toBe('1');
    expect(el('p').hasAttribute('transform')).toBe(false);
  });

  it('deletes only top-most selected parts and restores order on undo', () => {
    const { doc, history, el } = setup('<rect id="a"/><g id="g"><rect id="b"/></g><rect id="c"/>');
    const all = edit.deleteParts(doc, [el('c'), el('b'), el('g'), el('a')]);
    expect(all!.ops.length).toBe(3); // b is inside g: only top-most parts are removed
    roundTrip(doc, history, all);
    history.undo(doc);
    const [a, c] = [el('a'), el('c')];
    history.execute(doc, edit.deleteParts(doc, [c, a])!);
    expect(doc.root.querySelectorAll('rect').length).toBe(1);
    history.undo(doc);
    expect(Array.from(doc.root.children).map((c) => c.id)).toEqual(['a', 'g', 'c']);
  });

  it('changes z-order within the parent', () => {
    const { doc, history, el } = setup('<rect id="a"/><rect id="b"/><rect id="c"/>');
    roundTrip(doc, history, edit.moveZ(doc, el('a'), 'up'));
    expect(Array.from(doc.root.children).map((c) => c.id)).toEqual(['b', 'a', 'c']);
    expect(edit.moveZ(doc, el('c'), 'up')).toBeNull();
    roundTrip(doc, history, edit.moveZ(doc, el('c'), 'down'));
    expect(Array.from(doc.root.children).map((c) => c.id)).toEqual(['b', 'c', 'a']);
  });

  it('groups siblings in document order at the first index, and ungroups', () => {
    const { doc, history, el } = setup(
      '<rect id="a"/><rect id="b"/><rect id="c"/><g id="o"><rect id="x"/></g>',
    );
    expect(edit.canGroup([el('a'), el('x')])).toBe(false);
    const cmd = edit.groupParts(doc, [el('c'), el('b')], 'Group');
    roundTrip(doc, history, cmd);
    const group = doc.root.children[1];
    expect(group.localName).toBe('g');
    expect(Array.from(group.children).map((c) => c.id)).toEqual(['b', 'c']);
    expect(cmd!.selectAfter).toEqual(['group-1']);
    roundTrip(doc, history, edit.ungroup(doc, group));
    expect(Array.from(doc.root.children).map((c) => c.id)).toEqual(['a', 'b', 'c', 'o']);
  });

  it('folds group transform and inherited presentation into children on ungroup', () => {
    const { doc, run, el } = setup(
      '<g id="g" transform="translate(5 0)" fill="red" opacity="0.5"><rect id="r" transform="scale(2)" opacity="0.5"/><rect id="s" fill="blue"/></g>',
    );
    run(edit.ungroup(doc, el('g')));
    expect(el('r').getAttribute('transform')).toBe('translate(5 0) scale(2)');
    expect(el('r').getAttribute('fill')).toBe('red');
    expect(el('r').getAttribute('opacity')).toBe('0.25');
    expect(el('s').getAttribute('fill')).toBe('blue');
  });

  it('refuses to ungroup groups with clip-path, mask or filter', () => {
    const { doc, el } = setup('<g id="g" clip-path="url(#c)"><rect/></g>');
    expect(edit.ungroupBlocker(el('g'))).toBe('clip-path');
    expect(edit.ungroup(doc, el('g'))).toBeNull();
  });

  it('groups all artwork into #symbol-content, keeping defs at the root', () => {
    const { doc, history } = setup(
      '<defs><linearGradient id="lg"/></defs><rect id="a"/><title>x</title><rect id="b"/>',
    );
    roundTrip(doc, history, edit.groupAll(doc, 'Symbol content'));
    expect(Array.from(doc.root.children).map((c) => c.localName)).toEqual(['defs', 'title', 'g']);
    expect(edit.canGroupAll(doc)).toBe(false);
  });

  it('adds centred text placeholders inside #symbol-content when present', () => {
    const { doc, history, run } = setup('<rect id="a"/>');
    run(edit.groupAll(doc, 'Symbol content'));
    const cmd = edit.addText(doc, 'value', '75.5', 'Value');
    roundTrip(doc, history, cmd);
    const text = doc.root.querySelector('#symbol-content > text')!;
    expect(text.textContent).toBe('75.5');
    expect([
      text.getAttribute('x'),
      text.getAttribute('y'),
      text.getAttribute('font-size'),
    ]).toEqual(['100', '50', '12']);
    const part = buildBreakdown(doc).partOf.get(text)!;
    expect([part.id, part.role, part.name]).toEqual(['value-1', 'value', 'Value']);
  });

  it('applies and clears gauge progress on paths only', () => {
    const { doc, history, el } = setup('<path id="p" d="M0 0 L10 0" fill="red"/><rect id="r"/>');
    expect(edit.applyGauge(doc, el('r'), 50, '#00ff00')).toBeNull();
    roundTrip(doc, history, edit.applyGauge(doc, el('p'), 140, '#16a34a'));
    expect(el('p').getAttribute('stroke-dasharray')).toBe('100 0');
    expect(el('p').getAttribute('fill')).toBe('none');
    expect(edit.readProperties(doc, el('p')).gaugePercent).toBe(100);
    roundTrip(doc, history, edit.clearGauge(doc, el('p')));
    expect(el('p').hasAttribute('stroke-dasharray')).toBe(false);
  });

  it('reads properties with POC defaults and inline style values', () => {
    const { doc, el } = setup('<rect id="r" style="fill: rgb(255, 0, 0)" opacity="0.4"/>');
    const p = edit.readProperties(doc, el('r'));
    expect([p.fill, p.stroke, p.opacity, p.fontSize, p.textAnchor]).toEqual([
      '#ff0000',
      '#000000',
      0.4,
      16,
      'start',
    ]);
  });

  it('keeps a real sample intact through a batch of edits and full undo', () => {
    const doc = docFrom(readSample('counters/counter-card-admission.svg'));
    const history = new SymbolHistoryService();
    const original = fingerprint(doc.root);
    const parts = buildBreakdown(doc).flat;
    const first = buildBreakdown(doc).byId.get(parts[0].id)!;
    const last = buildBreakdown(doc).byId.get(parts[parts.length - 1].id)!;
    history.execute(doc, edit.setStyle(doc, [first], { fill: '#123456' }, true)!);
    history.execute(doc, edit.setTransform(doc, last, { rotation: 15, scaleX: 2 }, fakeGeometry)!);
    history.execute(doc, edit.deleteParts(doc, [last])!);
    history.execute(doc, edit.groupAll(doc, 'Symbol content')!);
    while (history.canUndo()) history.undo(doc);
    expect(fingerprint(doc.root)).toBe(original);
  });
});
