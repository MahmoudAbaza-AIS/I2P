import { describe, expect, it } from 'vitest';
import {
  REPRESENTATIVE,
  docFrom,
  fingerprint,
  idsOf,
  parseOrThrow,
  readSample,
} from '../testing/symbol-fixtures';
import { buildBreakdown } from './symbol-breakdown.service';
import { addText, rename, setStyle, toggleLock } from './symbol-edit.service';
import { exportSymbol } from './symbol-export.service';
import { SymbolHistoryService } from './symbol-history.service';

const NOW = '2026-11-23T00:00:00.000Z';

describe('symbol export', () => {
  it.each(REPRESENTATIVE)(
    'round-trips %s: import → break down → no-op edit → export is visually equivalent',
    (file) => {
      const source = readSample(file);
      const original = parseOrThrow(source);
      const doc = docFrom(source);
      const history = new SymbolHistoryService();
      const first = buildBreakdown(doc).flat[0];
      const el = buildBreakdown(doc).byId.get(first.id)!;
      // No-op edit: change then undo.
      history.execute(doc, setStyle(doc, [el], { fill: '#abcdef' }, false)!);
      history.undo(doc);

      const out = exportSymbol(doc, 'Test', NOW);
      const reparsed = new DOMParser().parseFromString(out.svg, 'image/svg+xml').documentElement;
      expect(reparsed.getElementsByTagName('parsererror').length).toBe(0);
      expect(fingerprint(reparsed, idsOf(original))).toBe(fingerprint(original, idsOf(original)));
    },
  );

  it('re-importing an export yields the same part ids (stable between runs)', () => {
    const source = readSample('icons/tile-bed.svg');
    const doc = docFrom(source);
    const ids = buildBreakdown(doc).flat.map((p) => p.id);
    const again = docFrom(exportSymbol(doc, 'x', NOW).svg);
    expect(buildBreakdown(again).flat.map((p) => p.id)).toEqual(ids);
  });

  it('writes POC-compatible metadata attributes and JSON schema v1', () => {
    const doc = docFrom(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><rect id="r" fill="#ff0000"/></svg>',
    );
    const rect = doc.root.querySelector('rect')!;
    const h = new SymbolHistoryService();
    h.execute(doc, rename(doc, rect, ' Body ')!);
    h.execute(doc, toggleLock(doc, rect)!);
    h.execute(doc, addText(doc, 'unit', 'bar', 'Unit')!);

    const out = exportSymbol(doc, 'Pump', NOW);
    expect(out.svg).toContain('data-name="Body"');
    expect(out.svg).toContain('data-locked="true"');
    expect(out.svg).toContain('id="unit-1"');
    expect(out.definition).toMatchObject({
      schemaVersion: 1,
      symbolType: 'composite-svg',
      name: 'Pump',
      width: 120,
      height: 60,
      viewBox: '0 0 120 60',
      createdAt: NOW,
    });
    expect(out.definition.elements).toEqual([
      expect.objectContaining({
        id: 'r',
        name: 'Body',
        role: 'graphic',
        elementType: 'other',
        locked: true,
        fill: '#ff0000',
      }),
      expect.objectContaining({
        id: 'unit-1',
        role: 'unit',
        elementType: 'text',
        defaultText: 'bar',
        x: 60,
        y: 30,
      }),
    ]);
  });

  it('does not modify the live document', () => {
    const doc = docFrom(readSample('chart-parts/capsule-filled-red.svg'));
    const before = fingerprint(doc.root);
    exportSymbol(doc, 'x', NOW);
    expect(fingerprint(doc.root)).toBe(before);
  });
});
