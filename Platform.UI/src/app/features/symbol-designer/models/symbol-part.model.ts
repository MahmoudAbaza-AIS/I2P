/** Semantic role of a symbol part (same vocabulary as the standalone POC). */
export type SymbolElementRole = 'graphic' | 'label' | 'value' | 'unit' | 'status' | 'text';

export const SYMBOL_ROLES: readonly SymbolElementRole[] = [
  'graphic',
  'label',
  'value',
  'unit',
  'status',
  'text',
];

/** Roles that can be added as new text placeholders. */
export type TextPlaceholderRole = Exclude<SymbolElementRole, 'graphic'>;

export const TEXT_PLACEHOLDER_ROLES: readonly TextPlaceholderRole[] = [
  'label',
  'value',
  'unit',
  'status',
  'text',
];

/** Structural kind of a part, derived from its SVG tag. */
export type PartKind = 'group' | 'text' | 'shape' | 'image' | 'use';

/** Editor-level transform applied on top of an element's original transform. */
export interface EditTransform {
  readonly translateX: number;
  readonly translateY: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export const IDENTITY_EDIT_TRANSFORM: EditTransform = {
  translateX: 0,
  translateY: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
};

/**
 * Editor metadata for one part. Lives in the model, never as attributes on the
 * symbol being edited; the exporter writes the persistent subset back out.
 */
export interface PartMeta {
  readonly id: string;
  readonly name: string | null;
  readonly role: SymbolElementRole;
  readonly locked: boolean;
  /**
   * Original `transform` attribute captured before the first editor transform:
   * null = not captured yet, '' = captured and the element had none.
   */
  readonly baseTransform: string | null;
  readonly editTransform: EditTransform;
  /** Rotation / scale pivot in the parent's coordinate space. */
  readonly pivot: { readonly x: number; readonly y: number } | null;
}

/** Immutable view of a part, produced by the breakdown service. */
export interface SymbolPart {
  readonly id: string;
  readonly name: string;
  readonly tag: string;
  readonly kind: PartKind;
  readonly role: SymbolElementRole;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly depth: number;
  readonly parentId: string | null;
  /** Children in visual stacking order: topmost first (matches the POC). */
  readonly children: readonly SymbolPart[];
}
