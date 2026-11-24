import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { StatusMessage, SymbolCommand } from '../models/symbol-command.model';
import {
  EditTransform,
  SymbolElementRole,
  SymbolPart,
  TextPlaceholderRole,
} from '../models/symbol-part.model';
import { SymbolDocument, SymbolLibraryEntry } from '../models/symbol.model';
import { ImportErrorCode, SvgImportService } from '../services/svg-import.service';
import { SymbolBreakdownService } from '../services/symbol-breakdown.service';
import {
  NO_GEOMETRY,
  StylePatch,
  SymbolEditService,
  SymbolGeometry,
} from '../services/symbol-edit.service';
import { SymbolExportService } from '../services/symbol-export.service';
import { SymbolHistoryService } from '../services/symbol-history.service';
import { SymbolLibraryService } from '../services/symbol-library.service';
import { downloadText, safeFileName } from '../utils/file';
import { DEFAULT_VIEWPORT, Viewport, ZOOM_STEP, pan, zoomAt } from '../utils/viewport';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';
export type LoadError = ImportErrorCode | 'loadFailed';
export type Backdrop = 'theme' | 'inverse' | 'checker';
export type StatusTone = 'info' | 'warn';

export interface ImportedSymbol {
  readonly id: string;
  readonly name: string;
  readonly source: string;
}

/**
 * Feature state for one designer page (provided by the page component, so the
 * session survives language/theme switches and is discarded on navigation).
 * Components read signals and call intent methods; all edits go through
 * commands + history.
 */
@Injectable()
export class SymbolDesignerStore {
  private readonly document = inject(DOCUMENT);
  private readonly transloco = inject(TranslocoService);
  private readonly importer = inject(SvgImportService);
  private readonly breakdownService = inject(SymbolBreakdownService);
  private readonly edits = inject(SymbolEditService);
  private readonly exporter = inject(SymbolExportService);
  private readonly library = inject(SymbolLibraryService);
  readonly history = inject(SymbolHistoryService);

  // ── Document ───────────────────────────────────────────────────────────
  readonly doc = signal<SymbolDocument | null>(null);
  /** Bumped after every DOM mutation; derived views depend on it. */
  readonly revision = signal(0);
  readonly breakdown = computed(() => {
    this.revision();
    const doc = this.doc();
    return doc ? this.breakdownService.build(doc) : null;
  });
  readonly roots = computed<readonly SymbolPart[]>(() => this.breakdown()?.roots ?? []);
  readonly partCount = computed(() => this.breakdown()?.flat.length ?? 0);
  readonly hasDocument = computed(() => this.doc() !== null);

  readonly symbolName = signal('');
  readonly loadState = signal<LoadState>('idle');
  readonly loadError = signal<LoadError | null>(null);
  readonly activeSource = signal<string | null>(null);
  readonly imported = signal<readonly ImportedSymbol[]>([]);

  // ── Selection ──────────────────────────────────────────────────────────
  readonly selection = signal<readonly string[]>([]);
  readonly hoveredId = signal<string | null>(null);
  readonly expanded = signal<ReadonlySet<string>>(new Set());
  readonly primaryId = computed(() => this.selection()[0] ?? null);
  readonly selectedElements = computed(() => {
    const b = this.breakdown();
    return b
      ? this.selection()
          .map((id) => b.byId.get(id))
          .filter((e): e is Element => !!e)
      : [];
  });
  readonly primaryElement = computed(() => this.selectedElements()[0] ?? null);
  readonly primaryPart = computed(() => {
    const el = this.primaryElement();
    return el ? (this.breakdown()?.partOf.get(el) ?? null) : null;
  });
  readonly properties = computed(() => {
    this.revision();
    const doc = this.doc();
    const el = this.primaryElement();
    return doc && el ? this.edits.readProperties(doc, el) : null;
  });

  // ── Capabilities ───────────────────────────────────────────────────────
  readonly canUndo = this.history.canUndo;
  readonly canRedo = this.history.canRedo;
  readonly isDirty = computed(() => this.history.size() > 0);
  readonly canGroup = computed(() => this.edits.canGroup(this.selectedElements()));
  readonly canUngroup = computed(() => this.edits.canUngroup(this.selectedElements()));
  readonly canGroupAll = computed(() => {
    this.revision();
    const doc = this.doc();
    return !!doc && this.edits.canGroupAll(doc);
  });
  readonly canDelete = computed(() => this.selection().length > 0);

  // ── View ───────────────────────────────────────────────────────────────
  readonly viewport = signal<Viewport>(DEFAULT_VIEWPORT);
  readonly backdrop = signal<Backdrop>('theme');
  readonly applyToChildren = signal(true);
  readonly status = signal<StatusMessage>({ key: 'symbolDesigner.status.empty' });
  readonly statusTone = signal<StatusTone>('info');
  /** Set by the canvas: live SVG geometry and current size. */
  geometry: SymbolGeometry = NO_GEOMETRY;
  canvasSize = { width: 0, height: 0 };

  private importCounter = 0;
  private dragCounter = 0;

  // ── Loading ────────────────────────────────────────────────────────────

  /** Ask before discarding edits (switching symbol). */
  private confirmDiscard(): boolean {
    if (!this.isDirty()) return true;
    const view = this.document.defaultView;
    return !view || view.confirm(this.transloco.translate('symbolDesigner.confirmDiscard'));
  }

  openLibraryEntry(entry: SymbolLibraryEntry): void {
    if (this.activeSource() === entry.url || !this.confirmDiscard()) return;
    this.loadState.set('loading');
    this.loadError.set(null);
    this.activeSource.set(entry.url);
    this.library.load(entry).subscribe({
      next: (source) => {
        if (this.activeSource() === entry.url) this.loadSource(source, entry.name, entry.url);
      },
      error: () => {
        if (this.activeSource() !== entry.url) return;
        this.fail('loadFailed');
      },
    });
  }

  async importFile(file: File): Promise<void> {
    const invalid = this.importer.validateFile(file);
    if (invalid) {
      this.setStatus({ key: `symbolDesigner.errors.${invalid}` }, 'warn');
      return;
    }
    if (!this.confirmDiscard()) return;
    const source = await file.text();
    const name = file.name.replace(/\.svg$/i, '');
    const id = `import:${++this.importCounter}`;
    if (this.loadSource(source, name, id)) {
      this.imported.update((list) => [{ id, name, source }, ...list]);
    }
  }

  openImported(item: ImportedSymbol): void {
    if (this.activeSource() === item.id || !this.confirmDiscard()) return;
    this.loadSource(item.source, item.name, item.id);
  }

  private loadSource(source: string, name: string, sourceId: string): boolean {
    const result = this.importer.parse(source);
    if (!result.ok) {
      this.activeSource.set(sourceId);
      this.fail(result.error);
      return false;
    }
    this.doc.set(this.breakdownService.createDocument(result.root));
    this.history.clear();
    this.selection.set([]);
    this.hoveredId.set(null);
    this.expanded.set(new Set());
    this.viewport.set(DEFAULT_VIEWPORT);
    this.symbolName.set(name);
    this.activeSource.set(sourceId);
    this.loadState.set('ready');
    this.loadError.set(null);
    this.bump();
    this.setStatus({ key: 'symbolDesigner.status.imported', params: { name } });
    return true;
  }

  private fail(error: LoadError): void {
    this.doc.set(null);
    this.history.clear();
    this.selection.set([]);
    this.loadState.set('error');
    this.loadError.set(error);
    this.setStatus({ key: `symbolDesigner.errors.${error}` }, 'warn');
  }

  // ── Selection ──────────────────────────────────────────────────────────

  /** POC selection rules: plain click selects one, Ctrl/Cmd toggles. */
  select(id: string, additive = false): void {
    if (additive) {
      const current = this.selection();
      this.selection.set(current.includes(id) ? current.filter((v) => v !== id) : [...current, id]);
    } else {
      this.selection.set([id]);
    }
    this.revealInTree(id);
  }

  clearSelection(): void {
    this.selection.set([]);
  }

  toggleExpanded(id: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Expand all ancestor groups so the part's tree row is visible. */
  private revealInTree(id: string): void {
    const b = this.breakdown();
    if (!b) return;
    const ancestors: string[] = [];
    for (let p = b.partOf.get(b.byId.get(id)!)?.parentId; p;) {
      ancestors.push(p);
      p = b.partOf.get(b.byId.get(p)!)?.parentId ?? null;
    }
    if (ancestors.every((a) => this.expanded().has(a))) return;
    this.expanded.update((set) => new Set([...set, ...ancestors]));
  }

  // ── Command plumbing ───────────────────────────────────────────────────

  private bump(): void {
    this.revision.update((r) => r + 1);
  }

  private setStatus(status: StatusMessage, tone: StatusTone = 'info'): void {
    this.status.set(status);
    this.statusTone.set(tone);
  }

  private run(cmd: SymbolCommand | null): void {
    const doc = this.doc();
    if (!doc || !cmd) return;
    this.history.execute(doc, cmd);
    this.afterChange(cmd);
  }

  private afterChange(cmd: SymbolCommand, applied = true): void {
    this.bump();
    const b = this.breakdown();
    if (applied && cmd.selectAfter) this.selection.set(cmd.selectAfter);
    // Drop ids that no longer exist (deleted, or undone creations).
    if (b) this.selection.update((ids) => ids.filter((id) => b.byId.has(id)));
    if (cmd.status) this.setStatus(cmd.status);
  }

  undo(): void {
    const doc = this.doc();
    const cmd = doc ? this.history.undo(doc) : null;
    if (cmd) {
      this.afterChange({ ops: [] }, false);
      this.setStatus({ key: 'symbolDesigner.status.undone' });
    }
  }

  redo(): void {
    const doc = this.doc();
    const cmd = doc ? this.history.redo(doc) : null;
    if (cmd) {
      this.afterChange({ ops: [], selectAfter: cmd.selectAfter });
      this.setStatus({ key: 'symbolDesigner.status.redone' });
    }
  }

  private withPrimary(fn: (doc: SymbolDocument, el: Element) => SymbolCommand | null): void {
    const doc = this.doc();
    const el = this.primaryElement();
    if (doc && el) this.run(fn(doc, el));
  }

  private withPart(
    id: string,
    fn: (doc: SymbolDocument, el: Element) => SymbolCommand | null,
  ): void {
    const doc = this.doc();
    const el = this.breakdown()?.byId.get(id);
    if (doc && el) this.run(fn(doc, el));
  }

  // ── Edit intents ───────────────────────────────────────────────────────

  /** Properties apply to the primary selection (POC behaviour). */
  setStyle(patch: StylePatch): void {
    this.withPrimary((doc, el) => this.edits.setStyle(doc, [el], patch, this.applyToChildren()));
  }

  setText(text: string): void {
    this.withPrimary((doc, el) => this.edits.setText(doc, el, text));
  }

  setPosition(x: number, y: number): void {
    this.withPrimary((doc, el) => this.edits.setPosition(doc, el, x, y));
  }

  rename(name: string): void {
    this.withPrimary((doc, el) => this.edits.rename(doc, el, name));
  }

  setRole(role: SymbolElementRole): void {
    this.withPrimary((doc, el) => this.edits.setRole(doc, el, role));
  }

  setTransform(patch: Partial<EditTransform>): void {
    this.withPrimary((doc, el) => this.edits.setTransform(doc, el, patch, this.geometry));
  }

  applyGauge(percent: number, color: string): void {
    this.withPrimary((doc, el) => this.edits.applyGauge(doc, el, percent, color));
  }

  clearGauge(): void {
    this.withPrimary((doc, el) => this.edits.clearGauge(doc, el));
  }

  toggleVisibility(id: string): void {
    this.withPart(id, (doc, el) => this.edits.toggleVisibility(doc, el));
  }

  toggleLock(id: string): void {
    this.withPart(id, (doc, el) => this.edits.toggleLock(doc, el));
  }

  moveZ(id: string, direction: 'up' | 'down'): void {
    this.withPart(id, (doc, el) => this.edits.moveZ(doc, el, direction));
  }

  deletePart(id: string): void {
    this.withPart(id, (doc, el) => this.edits.deleteParts(doc, [el]));
  }

  deleteSelected(): void {
    const doc = this.doc();
    if (doc) this.run(this.edits.deleteParts(doc, this.selectedElements()));
  }

  group(): void {
    const doc = this.doc();
    if (!doc) return;
    const name = this.transloco.translate('symbolDesigner.defaults.groupName');
    this.run(this.edits.groupParts(doc, this.selectedElements(), name));
  }

  ungroup(): void {
    const doc = this.doc();
    const el = this.primaryElement();
    if (!doc || !el) return;
    const blocker = this.edits.ungroupBlocker(el);
    if (blocker) {
      this.setStatus(
        { key: 'symbolDesigner.status.ungroupBlocked', params: { effect: blocker } },
        'warn',
      );
      return;
    }
    this.run(this.edits.ungroup(doc, el));
  }

  groupAll(): void {
    const doc = this.doc();
    if (!doc) return;
    this.run(
      this.edits.groupAll(doc, this.transloco.translate('symbolDesigner.defaults.symbolContent')),
    );
    const id = this.primaryId();
    if (id) this.expanded.update((set) => new Set([...set, id]));
  }

  addText(role: TextPlaceholderRole): void {
    const doc = this.doc();
    if (!doc) return;
    const text = this.transloco.translate(`symbolDesigner.defaults.text.${role}`);
    const name = this.transloco.translate(`symbolDesigner.roles.${role}`);
    this.run(this.edits.addText(doc, role, text, name));
    const id = this.primaryId();
    if (id) this.revealInTree(id);
  }

  /** Canvas drag: per-element deltas in parent space; one undo step per drag. */
  beginDrag(): string {
    return `drag-${++this.dragCounter}`;
  }

  dragBy(deltas: ReadonlyMap<Element, { dx: number; dy: number }>, key: string): void {
    const doc = this.doc();
    if (doc) this.run(this.edits.moveParts(doc, deltas, key, this.geometry));
  }

  // ── Viewport ───────────────────────────────────────────────────────────

  zoomBy(factor: number, at?: { x: number; y: number }): void {
    const p = at ?? { x: this.canvasSize.width / 2, y: this.canvasSize.height / 2 };
    this.viewport.update((v) => zoomAt(v, factor, p.x, p.y));
  }

  zoomIn(): void {
    this.zoomBy(ZOOM_STEP);
  }

  zoomOut(): void {
    this.zoomBy(1 / ZOOM_STEP);
  }

  panBy(dx: number, dy: number): void {
    this.viewport.update((v) => pan(v, dx, dy));
  }

  resetView(): void {
    this.viewport.set(DEFAULT_VIEWPORT);
  }

  // ── Export ─────────────────────────────────────────────────────────────

  exportFiles(): void {
    const doc = this.doc();
    if (!doc) return;
    const name = this.symbolName().trim() || 'symbol';
    const base = safeFileName(name);
    const out = this.exporter.export(doc, name);
    downloadText(this.document, `${base}.svg`, out.svg, 'image/svg+xml');
    downloadText(
      this.document,
      `${base}.json`,
      JSON.stringify(out.definition, null, 2),
      'application/json',
    );
    this.setStatus({ key: 'symbolDesigner.status.exported', params: { name: base } });
  }
}
