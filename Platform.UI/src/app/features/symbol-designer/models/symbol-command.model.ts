import { PartMeta } from './symbol-part.model';

/** Set (or remove, when `null`) one attribute. */
export interface AttrOp {
  readonly kind: 'attr';
  readonly el: Element;
  readonly name: string;
  readonly before: string | null;
  readonly after: string | null;
}

/** Replace an element's text content. */
export interface TextOp {
  readonly kind: 'text';
  readonly el: Element;
  readonly before: string;
  readonly after: string;
}

/** Replace a part's editor metadata (`before` null = part did not exist yet). */
export interface MetaOp {
  readonly kind: 'meta';
  readonly el: Element;
  readonly before: PartMeta | null;
  readonly after: PartMeta;
}

/** Move a node in the tree. A `null` parent means "detached". */
export interface NodeOp {
  readonly kind: 'node';
  readonly node: Element;
  readonly fromParent: Element | null;
  readonly fromNext: Node | null;
  readonly toParent: Element | null;
  readonly toNext: Node | null;
}

export type EditOp = AttrOp | TextOp | MetaOp | NodeOp;

/** Translation key + params for the status line after a command runs. */
export interface StatusMessage {
  readonly key: string;
  readonly params?: Record<string, string | number>;
}

/**
 * A reversible edit. Commands are plain data (a list of primitive ops),
 * so history can apply, revert and merge them without knowing their type.
 */
export interface SymbolCommand {
  readonly ops: readonly EditOp[];
  /** Consecutive commands with the same key (within the merge window) merge into one undo step. */
  readonly mergeKey?: string;
  readonly status?: StatusMessage;
  /** Part ids to select after the command is applied. */
  readonly selectAfter?: readonly string[];
}
