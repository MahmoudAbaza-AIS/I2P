import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { DesignerToolbarComponent } from './components/designer-toolbar/designer-toolbar.component';
import { PartsTreePanelComponent } from './components/parts-tree-panel/parts-tree-panel.component';
import { PropertiesPanelComponent } from './components/properties-panel/properties-panel.component';
import { SymbolCanvasComponent } from './components/symbol-canvas/symbol-canvas.component';
import { SymbolLibraryPanelComponent } from './components/symbol-library-panel/symbol-library-panel.component';
import { SymbolHistoryService } from './services/symbol-history.service';
import { SymbolDesignerStore } from './state/symbol-designer.store';

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Symbol Designer page. Owns the per-session store and history (so a language
 * or theme switch keeps the open symbol, selection and undo stack).
 *
 * Shared control styles live here with encapsulation off, scoped under `.sd`,
 * so child components reuse them and each stays under the style budget.
 * All colours are I2P tokens from styles.css.
 */
@Component({
  selector: 'app-symbol-designer-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  providers: [SymbolDesignerStore, SymbolHistoryService],
  imports: [
    TranslocoModule,
    DesignerToolbarComponent,
    SymbolLibraryPanelComponent,
    SymbolCanvasComponent,
    PartsTreePanelComponent,
    PropertiesPanelComponent,
  ],
  template: `
    <div class="sd">
      <div class="page-header">
        <h1 class="page-title">{{ 'symbolDesigner.title' | transloco }}</h1>
        <p class="page-subtitle">{{ 'symbolDesigner.subtitle' | transloco }}</p>
      </div>

      <app-designer-toolbar />

      <div class="sd-workspace">
        <app-symbol-library-panel class="sd-workspace__library" />
        <div class="sd-workspace__center">
          <app-symbol-canvas class="sd-workspace__canvas" />
          <p
            class="sd-status"
            [class.sd-status--warn]="store.statusTone() === 'warn'"
            role="status"
            aria-live="polite"
          >
            {{ store.status().key | transloco: store.status().params ?? {} }}
          </p>
        </div>
        <div class="sd-workspace__side">
          <app-parts-tree-panel />
          <app-properties-panel />
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .sd {
        --sd-radius: 8px;
        --sd-accent-soft: color-mix(in srgb, var(--primary-color) 14%, transparent);
        --sd-muted-bg: color-mix(in srgb, var(--text-color) 6%, transparent);
        --sd-danger-text: color-mix(in srgb, var(--color-danger) 78%, var(--text-color));
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        color: var(--text-color);
      }
      .sd .page-header {
        margin: 0;
      }
      .sd .page-title {
        margin: 0 0 0.25rem;
        font-size: 1.5rem;
        font-weight: 700;
      }
      .sd .page-subtitle {
        margin: 0;
        color: var(--text-color-secondary);
        font-size: 0.9375rem;
      }

      .sd-workspace {
        display: grid;
        grid-template-columns: minmax(13rem, 15rem) minmax(0, 1fr) minmax(18rem, 22rem);
        gap: 0.75rem;
        height: max(36rem, calc(100dvh - 17rem));
      }
      .sd-workspace > * {
        min-height: 0;
        min-width: 0;
      }
      .sd-workspace__library,
      .sd-workspace__side > * {
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .sd-workspace__center {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .sd-workspace__canvas {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .sd-workspace__side {
        display: grid;
        grid-template-rows: minmax(12rem, 2fr) minmax(0, 3fr);
        gap: 0.75rem;
      }
      @media (max-width: 1200px) {
        .sd-workspace {
          grid-template-columns: minmax(12rem, 14rem) minmax(0, 1fr);
          height: auto;
        }
        .sd-workspace__center {
          min-height: 32rem;
        }
        .sd-workspace__side {
          grid-column: 1 / -1;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 30rem;
        }
      }
      @media (max-width: 768px) {
        .sd-workspace {
          grid-template-columns: 1fr;
        }
        .sd-workspace__library {
          max-height: 20rem;
        }
        .sd-workspace__side {
          grid-template-columns: 1fr;
          grid-template-rows: 24rem auto;
        }
      }

      .sd-panel {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        flex: 1;
        min-height: 0;
        overflow: hidden;
        padding: 0.75rem;
        background: var(--surface-card);
        border: 1px solid var(--surface-border);
        border-radius: var(--sd-radius);
      }
      .sd-panel__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .sd-panel__title {
        margin: 0;
        font-size: 0.875rem;
        font-weight: 700;
      }
      .sd-panel__subtitle {
        margin: 0.125rem 0 0;
        font-size: 0.75rem;
        color: var(--text-color-secondary);
      }
      .sd-panel__empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.375rem;
        padding: 1.5rem 0.75rem;
        text-align: center;
        font-size: 0.8125rem;
        color: var(--text-color-secondary);
      }
      .sd-panel__empty strong {
        color: var(--text-color);
      }
      .sd-panel__empty small {
        font-size: 0.75rem;
        max-width: 18rem;
      }

      .sd-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.5rem;
        height: 1.375rem;
        padding: 0 0.5rem;
        border-radius: 999px;
        background: var(--sd-accent-soft);
        color: var(--primary-color);
        font-size: 0.75rem;
        font-weight: 700;
      }
      .sd-hint {
        margin: 0;
        font-size: 0.75rem;
        line-height: 1.45;
        color: var(--text-color-secondary);
      }
      .sd-hint--warn {
        color: var(--text-color);
        border-inline-start: 3px solid var(--color-warning);
        padding-inline-start: 0.5rem;
      }

      .sd-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        min-height: 2rem;
        padding: 0.25rem 0.625rem;
        border: 1px solid var(--surface-border);
        border-radius: 6px;
        background: var(--surface-card);
        color: var(--text-color);
        font: inherit;
        font-size: 0.8125rem;
        white-space: nowrap;
        cursor: pointer;
        transition:
          background 0.15s,
          border-color 0.15s;
      }
      .sd-btn:hover:not(:disabled) {
        background: var(--surface-hover);
      }
      .sd-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .sd-btn--primary {
        background: var(--primary-color);
        border-color: var(--primary-color);
        color: var(--primary-color-text);
      }
      .sd-btn--primary:hover:not(:disabled) {
        background: color-mix(in srgb, var(--primary-color) 85%, var(--text-color));
      }
      .sd-btn--danger {
        color: var(--sd-danger-text);
      }
      .sd-btn--icon {
        width: 2rem;
        padding: 0.25rem;
        justify-content: center;
      }
      .sd-btn:has(input:focus-visible) {
        outline: var(--focus-ring-width) solid var(--focus-ring-color);
        outline-offset: 2px;
      }

      .sd-icon-btn {
        display: inline-grid;
        place-items: center;
        width: 1.5rem;
        height: 1.5rem;
        padding: 0;
        border: 0;
        border-radius: 4px;
        background: transparent;
        color: var(--text-color-secondary);
        cursor: pointer;
      }
      .sd-icon-btn:hover {
        background: var(--surface-hover);
        color: var(--text-color);
      }
      .sd-icon-btn--muted {
        opacity: 0.6;
      }
      .sd-icon-btn--active {
        color: var(--primary-color);
      }
      .sd-icon-btn--danger:hover {
        color: var(--sd-danger-text);
      }

      .sd-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 0;
        font-size: 0.75rem;
        color: var(--text-color-secondary);
      }
      .sd-input {
        width: 100%;
        min-height: 2rem;
        padding: 0.3125rem 0.5rem;
        border: 1px solid var(--surface-border);
        border-radius: 6px;
        background: var(--surface-ground);
        color: var(--text-color);
        font: inherit;
        font-size: 0.8125rem;
      }
      .sd-input:focus {
        border-color: var(--primary-color);
      }
      .sd-input:disabled {
        opacity: 0.6;
      }
      textarea.sd-input {
        resize: vertical;
      }
      .sd-check {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.8125rem;
      }
      .sd input[type='range'] {
        width: 100%;
        accent-color: var(--primary-color);
      }

      .sd-icon {
        display: inline-flex;
        flex: none;
      }
      .sd-icon svg {
        display: block;
      }
      [dir='rtl'] .sd-flip-rtl {
        transform: scaleX(-1);
      }
      /* Technical values (ids, coordinates, hex, units) stay LTR with Latin digits (log D12). */
      .sd-ltr {
        direction: ltr;
        unicode-bidi: isolate;
      }
      .sd-visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        border: 0;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }

      .sd-status {
        margin: 0;
        min-height: 2rem;
        padding: 0.375rem 0.625rem;
        border-radius: 4px;
        border-inline-start: 3px solid var(--primary-color);
        background: var(--surface-card);
        color: var(--text-color-secondary);
        font-size: 0.8125rem;
      }
      .sd-status--warn {
        border-inline-start-color: var(--color-warning);
        color: var(--text-color);
      }
    `,
  ],
})
export class SymbolDesignerPageComponent {
  protected readonly store = inject(SymbolDesignerStore);

  /** Standard editor shortcuts (log D16). Ignored while typing in a form field. */
  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && (EDITABLE.has(target.tagName) || target.isContentEditable)) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && key === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.store.undo();
    } else if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) {
      event.preventDefault();
      this.store.redo();
    } else if ((key === 'delete' || key === 'backspace') && this.store.canDelete()) {
      event.preventDefault();
      this.store.deleteSelected();
    } else if (key === 'escape') {
      this.store.clearSelection();
    }
  }
}
