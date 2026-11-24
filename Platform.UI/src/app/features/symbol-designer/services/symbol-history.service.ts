import { Injectable, computed, signal } from '@angular/core';
import { EditOp, SymbolCommand } from '../models/symbol-command.model';
import { SymbolDocument } from '../models/symbol.model';

export const HISTORY_LIMIT = 100;
/** Consecutive commands with the same mergeKey inside this window become one undo step. */
export const MERGE_WINDOW_MS = 1500;

function insert(parent: Element | null, node: Element, next: Node | null): void {
  if (!parent) {
    node.remove();
    return;
  }
  // `next` may itself have moved; fall back to append if it is no longer a child.
  parent.insertBefore(node, next && next.parentNode === parent ? next : null);
}

function applyOp(doc: SymbolDocument, op: EditOp, forward: boolean): void {
  switch (op.kind) {
    case 'attr': {
      const value = forward ? op.after : op.before;
      if (value === null) op.el.removeAttribute(op.name);
      else op.el.setAttribute(op.name, value);
      break;
    }
    case 'text':
      op.el.textContent = forward ? op.after : op.before;
      break;
    case 'meta': {
      const value = forward ? op.after : op.before;
      if (value) doc.meta.set(op.el, value);
      else doc.meta.delete(op.el);
      break;
    }
    case 'node':
      if (forward) insert(op.toParent, op.node, op.toNext);
      else insert(op.fromParent, op.node, op.fromNext);
      break;
  }
}

export function applyCommand(doc: SymbolDocument, cmd: SymbolCommand): void {
  for (const op of cmd.ops) applyOp(doc, op, true);
}

export function revertCommand(doc: SymbolDocument, cmd: SymbolCommand): void {
  for (let i = cmd.ops.length - 1; i >= 0; i--) applyOp(doc, cmd.ops[i], false);
}

function opKey(op: EditOp): string | null {
  // Element identity is not a string; merging is restricted to attr/text/meta ops on
  // the same element objects, matched by reference below.
  return op.kind === 'node' ? null : op.kind + (op.kind === 'attr' ? ':' + op.name : '');
}

/**
 * Merge `next` into `prev`: for each (element, attribute) keep the earliest
 * `before` and the latest `after`. Only attr/text/meta ops merge; a command
 * with structural ops never merges.
 */
export function mergeCommands(prev: SymbolCommand, next: SymbolCommand): SymbolCommand | null {
  if (prev.ops.some((o) => o.kind === 'node') || next.ops.some((o) => o.kind === 'node'))
    return null;
  type ValueOp = Exclude<EditOp, { kind: 'node' }>;
  const merged = [...prev.ops] as ValueOp[];
  for (const op of next.ops as ValueOp[]) {
    const key = opKey(op);
    const idx = merged.findIndex((m) => opKey(m) === key && m.el === op.el);
    if (idx < 0) {
      merged.push(op);
      continue;
    }
    merged[idx] = { ...op, before: merged[idx].before } as ValueOp;
  }
  return { ...next, ops: merged };
}

interface Entry {
  readonly cmd: SymbolCommand;
  readonly at: number;
}

/**
 * Undo/redo stack of inverse-op commands (log D8). Not a root singleton:
 * one instance per designer page so sessions never share history.
 */
@Injectable()
export class SymbolHistoryService {
  private readonly undoStack = signal<readonly Entry[]>([]);
  private readonly redoStack = signal<readonly Entry[]>([]);

  readonly canUndo = computed(() => this.undoStack().length > 0);
  readonly canRedo = computed(() => this.redoStack().length > 0);
  readonly size = computed(() => this.undoStack().length);

  /** Clock used for the merge window (replaceable in tests). */
  clock: () => number = () => Date.now();

  execute(doc: SymbolDocument, cmd: SymbolCommand): void {
    if (cmd.ops.length === 0) return;
    applyCommand(doc, cmd);
    const at = this.clock();
    const stack = this.undoStack();
    const last = stack[stack.length - 1];
    if (
      last &&
      cmd.mergeKey &&
      last.cmd.mergeKey === cmd.mergeKey &&
      at - last.at <= MERGE_WINDOW_MS
    ) {
      const merged = mergeCommands(last.cmd, cmd);
      if (merged) {
        this.undoStack.set([...stack.slice(0, -1), { cmd: merged, at }]);
        this.redoStack.set([]);
        return;
      }
    }
    const next = [...stack, { cmd, at }];
    this.undoStack.set(
      next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next,
    );
    this.redoStack.set([]);
  }

  /** Returns the command that was undone, or null. */
  undo(doc: SymbolDocument): SymbolCommand | null {
    const stack = this.undoStack();
    const entry = stack[stack.length - 1];
    if (!entry) return null;
    revertCommand(doc, entry.cmd);
    this.undoStack.set(stack.slice(0, -1));
    this.redoStack.set([...this.redoStack(), entry]);
    return entry.cmd;
  }

  redo(doc: SymbolDocument): SymbolCommand | null {
    const stack = this.redoStack();
    const entry = stack[stack.length - 1];
    if (!entry) return null;
    applyCommand(doc, entry.cmd);
    this.redoStack.set(stack.slice(0, -1));
    // `at: 0` so a redone step never merges with the next edit.
    this.undoStack.set([...this.undoStack(), { cmd: entry.cmd, at: 0 }]);
    return entry.cmd;
  }

  clear(): void {
    this.undoStack.set([]);
    this.redoStack.set([]);
  }
}
