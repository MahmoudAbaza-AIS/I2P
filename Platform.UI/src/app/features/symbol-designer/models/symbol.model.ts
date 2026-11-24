import { PartMeta, SymbolElementRole } from './symbol-part.model';

/**
 * An editable symbol: a sanitized, detached SVG root plus editor metadata.
 * The DOM is the source of truth for the artwork; `meta` holds editor state
 * keyed by element, so removed-then-restored nodes keep their metadata.
 */
export interface SymbolDocument {
  readonly root: SVGSVGElement;
  readonly meta: Map<Element, PartMeta>;
  /** Monotonic counter for ids of parts created in this session. */
  nextCreatedId: number;
}

export interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SymbolElementMetadata {
  id: string;
  name: string;
  role: SymbolElementRole;
  elementType: 'text' | 'shape' | 'group' | 'other';
  parentId?: string;
  visible: boolean;
  locked: boolean;
  defaultText?: string;
  x?: number;
  y?: number;
  fontSize?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  textAnchor?: string;
}

/** Exported JSON definition. Schema v1, compatible with the standalone POC. */
export interface SymbolDefinition {
  schemaVersion: 1;
  symbolType: 'composite-svg';
  name: string;
  width: number;
  height: number;
  viewBox: string;
  svgFile: string;
  elements: SymbolElementMetadata[];
  createdAt: string;
}

/** One entry of the generated sample-symbol manifest. */
export interface SymbolLibraryEntry {
  readonly category: string;
  readonly file: string;
  readonly name: string;
  readonly url: string;
  readonly sizeKb: number;
}
