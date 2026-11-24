import { describe, expect, it } from 'vitest';
import { SymbolCommand } from '../models/symbol-command.model';
import { docFrom } from '../testing/symbol-fixtures';
import {
  HISTORY_LIMIT,
  MERGE_WINDOW_MS,
  SymbolHistoryService,
  mergeCommands,
} from './symbol-history.service';

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect id="r" fill="red"/></svg>';

function setFill(
  el: Element,
  before: string | null,
  after: string | null,
  mergeKey?: string,
): SymbolCommand {
  return { ops: [{ kind: 'attr', el, name: 'fill', before, after }], mergeKey };
}

describe('symbol history', () => {
  it('executes, undoes and redoes', () => {
    const doc = docFrom(svg);
    const rect = doc.root.querySelector('rect')!;
    const h = new SymbolHistoryService();
    h.execute(doc, setFill(rect, 'red', 'blue'));
    expect(rect.getAttribute('fill')).toBe('blue');
    expect(h.canUndo()).toBe(true);
    h.undo(doc);
    expect(rect.getAttribute('fill')).toBe('red');
    expect(h.canRedo()).toBe(true);
    h.redo(doc);
    expect(rect.getAttribute('fill')).toBe('blue');
  });

  it('clears redo on a new command', () => {
    const doc = docFrom(svg);
    const rect = doc.root.querySelector('rect')!;
    const h = new SymbolHistoryService();
    h.execute(doc, setFill(rect, 'red', 'blue'));
    h.undo(doc);
    h.execute(doc, setFill(rect, 'red', 'green'));
    expect(h.canRedo()).toBe(false);
  });

  it('merges same-key commands inside the window into one undo step', () => {
    const doc = docFrom(svg);
    const rect = doc.root.querySelector('rect')!;
    const h = new SymbolHistoryService();
    let now = 1000;
    h.clock = () => now;
    h.execute(doc, setFill(rect, 'red', 'a', 'k'));
    now += 100;
    h.execute(doc, setFill(rect, 'a', 'b', 'k'));
    now += MERGE_WINDOW_MS + 1;
    h.execute(doc, setFill(rect, 'b', 'c', 'k'));
    expect(h.size()).toBe(2);
    h.undo(doc);
    expect(rect.getAttribute('fill')).toBe('b');
    h.undo(doc);
    expect(rect.getAttribute('fill')).toBe('red');
  });

  it('caps the history length', () => {
    const doc = docFrom(svg);
    const rect = doc.root.querySelector('rect')!;
    const h = new SymbolHistoryService();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++)
      h.execute(doc, setFill(rect, String(i), String(i + 1)));
    expect(h.size()).toBe(HISTORY_LIMIT);
  });

  it('does not merge structural commands', () => {
    const doc = docFrom(svg);
    const rect = doc.root.querySelector('rect')!;
    const node: SymbolCommand = {
      ops: [
        {
          kind: 'node',
          node: rect,
          fromParent: doc.root,
          fromNext: null,
          toParent: null,
          toNext: null,
        },
      ],
    };
    expect(mergeCommands(node, setFill(rect, 'a', 'b'))).toBeNull();
  });

  it('ignores empty commands', () => {
    const h = new SymbolHistoryService();
    h.execute(docFrom(svg), { ops: [] });
    expect(h.canUndo()).toBe(false);
  });
});
