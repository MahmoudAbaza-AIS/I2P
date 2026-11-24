import {
  ChangeDetectionStrategy,
  ViewEncapsulation,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { PartKind, SymbolPart } from '../../models/symbol-part.model';
import { SymbolDesignerStore } from '../../state/symbol-designer.store';
import { DesignerIconComponent, DesignerIconName } from '../designer-icon/designer-icon.component';

interface Row {
  readonly part: SymbolPart;
  readonly expanded: boolean;
  readonly selected: boolean;
  readonly posInSet: number;
  readonly setSize: number;
}

const KIND_ICON: Readonly<Record<PartKind, DesignerIconName>> = {
  group: 'layers',
  text: 'text',
  shape: 'shape',
  image: 'image',
  use: 'link',
};

@Component({
  selector: 'app-parts-tree-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styleUrl: './parts-tree-panel.component.css',
  imports: [TranslocoModule, DesignerIconComponent],
  template: `
    <section class="sd-panel sd-tree" [attr.aria-labelledby]="'sd-tree-title'">
      <header class="sd-panel__head">
        <div>
          <h2 id="sd-tree-title" class="sd-panel__title">
            {{ 'symbolDesigner.tree.title' | transloco }}
          </h2>
          <p class="sd-panel__subtitle">{{ 'symbolDesigner.tree.subtitle' | transloco }}</p>
        </div>
        <span class="sd-badge sd-ltr">{{ store.partCount() }}</span>
      </header>

      @if (rows().length) {
        <div
          #list
          class="sd-tree__list"
          role="tree"
          aria-multiselectable="true"
          [attr.aria-labelledby]="'sd-tree-title'"
        >
          @for (row of rows(); track row.part.id) {
            <div
              class="sd-tree__row"
              role="treeitem"
              tabindex="0"
              [attr.data-part-id]="row.part.id"
              [attr.aria-level]="row.part.depth + 1"
              [attr.aria-setsize]="row.setSize"
              [attr.aria-posinset]="row.posInSet"
              [attr.aria-selected]="row.selected"
              [attr.aria-expanded]="row.part.kind === 'group' ? row.expanded : null"
              [class.sd-tree__row--selected]="row.selected"
              [class.sd-tree__row--hidden]="!row.part.visible"
              [style.padding-inline-start.rem]="0.25 + row.part.depth * 0.875"
              (click)="store.select(row.part.id, $event.ctrlKey || $event.metaKey)"
              (keydown)="onRowKey($event, row)"
              (mouseenter)="store.hoveredId.set(row.part.id)"
              (mouseleave)="store.hoveredId.set(null)"
            >
              @if (row.part.kind === 'group') {
                <button
                  type="button"
                  class="sd-tree__toggle"
                  [class.sd-tree__toggle--open]="row.expanded"
                  tabindex="-1"
                  (click)="$event.stopPropagation(); store.toggleExpanded(row.part.id)"
                  [attr.aria-label]="
                    (row.expanded ? 'symbolDesigner.tree.collapse' : 'symbolDesigner.tree.expand')
                      | transloco
                  "
                >
                  <app-designer-icon name="chevron" />
                </button>
              } @else {
                <span class="sd-tree__toggle" aria-hidden="true"></span>
              }
              <span class="sd-tree__kind" [attr.data-kind]="row.part.kind"
                ><app-designer-icon [name]="kindIcon[row.part.kind]"
              /></span>
              <span class="sd-tree__name" dir="auto" [title]="row.part.name">{{
                row.part.name
              }}</span>
              <span class="sd-tree__tag sd-ltr">{{ row.part.tag }}</span>
              <span class="sd-tree__actions">
                <button
                  type="button"
                  class="sd-icon-btn"
                  tabindex="-1"
                  [class.sd-icon-btn--muted]="!row.part.visible"
                  [attr.aria-label]="
                    (row.part.visible ? 'symbolDesigner.tree.hide' : 'symbolDesigner.tree.show')
                      | transloco
                  "
                  [title]="
                    (row.part.visible ? 'symbolDesigner.tree.hide' : 'symbolDesigner.tree.show')
                      | transloco
                  "
                  (click)="$event.stopPropagation(); store.toggleVisibility(row.part.id)"
                >
                  <app-designer-icon [name]="row.part.visible ? 'eye' : 'eyeOff'" />
                </button>
                <button
                  type="button"
                  class="sd-icon-btn"
                  tabindex="-1"
                  [class.sd-icon-btn--active]="row.part.locked"
                  [attr.aria-label]="
                    (row.part.locked ? 'symbolDesigner.tree.unlock' : 'symbolDesigner.tree.lock')
                      | transloco
                  "
                  [title]="
                    (row.part.locked ? 'symbolDesigner.tree.unlock' : 'symbolDesigner.tree.lock')
                      | transloco
                  "
                  (click)="$event.stopPropagation(); store.toggleLock(row.part.id)"
                >
                  <app-designer-icon [name]="row.part.locked ? 'lock' : 'unlock'" />
                </button>
                <button
                  type="button"
                  class="sd-icon-btn"
                  tabindex="-1"
                  [attr.aria-label]="'symbolDesigner.tree.bringForward' | transloco"
                  [title]="'symbolDesigner.tree.bringForward' | transloco"
                  (click)="$event.stopPropagation(); store.moveZ(row.part.id, 'up')"
                >
                  <app-designer-icon name="up" />
                </button>
                <button
                  type="button"
                  class="sd-icon-btn"
                  tabindex="-1"
                  [attr.aria-label]="'symbolDesigner.tree.sendBackward' | transloco"
                  [title]="'symbolDesigner.tree.sendBackward' | transloco"
                  (click)="$event.stopPropagation(); store.moveZ(row.part.id, 'down')"
                >
                  <app-designer-icon name="down" />
                </button>
                <button
                  type="button"
                  class="sd-icon-btn sd-icon-btn--danger"
                  tabindex="-1"
                  [attr.aria-label]="'symbolDesigner.tree.delete' | transloco"
                  [title]="'symbolDesigner.tree.delete' | transloco"
                  (click)="$event.stopPropagation(); store.deletePart(row.part.id)"
                >
                  <app-designer-icon name="trash" />
                </button>
              </span>
            </div>
          }
        </div>
        <p class="sd-hint">{{ 'symbolDesigner.tree.hint' | transloco }}</p>
      } @else {
        <div class="sd-panel__empty">
          <app-designer-icon name="layers" />
          <strong>{{ 'symbolDesigner.tree.emptyHeading' | transloco }}</strong>
          <small>{{ 'symbolDesigner.tree.emptyMessage' | transloco }}</small>
        </div>
      }
    </section>
  `,
})
export class PartsTreePanelComponent {
  protected readonly store = inject(SymbolDesignerStore);
  protected readonly kindIcon = KIND_ICON;
  private readonly list = viewChild<ElementRef<HTMLDivElement>>('list');

  /** Visible rows: the tree flattened through expanded groups (POC `rebuildLayers`). */
  protected readonly rows = computed<Row[]>(() => {
    const expanded = this.store.expanded();
    const selected = new Set(this.store.selection());
    const out: Row[] = [];
    const walk = (parts: readonly SymbolPart[]) => {
      parts.forEach((part, i) => {
        const isOpen = part.kind === 'group' && expanded.has(part.id);
        out.push({
          part,
          expanded: isOpen,
          selected: selected.has(part.id),
          posInSet: i + 1,
          setSize: parts.length,
        });
        if (isOpen) walk(part.children);
      });
    };
    walk(this.store.roots());
    return out;
  });

  constructor() {
    // Keep the primary selection visible when it was picked on the canvas.
    effect(() => {
      const id = this.store.primaryId();
      this.rows();
      const list = this.list()?.nativeElement;
      if (!id || !list) return;
      untracked(() =>
        requestAnimationFrame(() =>
          Array.from(list.querySelectorAll<HTMLElement>('[data-part-id]'))
            .find((row) => row.dataset['partId'] === id)
            ?.scrollIntoView?.({ block: 'nearest' }),
        ),
      );
    });
  }

  protected onRowKey(event: KeyboardEvent, row: Row): void {
    const isGroup = row.part.kind === 'group';
    // Arrow semantics follow reading direction: "forward" opens a group.
    const rtl = getComputedStyle(event.currentTarget as Element).direction === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.store.select(row.part.id, event.ctrlKey || event.metaKey);
        break;
      case forward:
        if (isGroup && !row.expanded) this.store.toggleExpanded(row.part.id);
        break;
      case back:
        if (isGroup && row.expanded) this.store.toggleExpanded(row.part.id);
        break;
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        const rows = Array.from(
          this.list()?.nativeElement.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [],
        );
        const idx = rows.indexOf(event.currentTarget as HTMLElement);
        rows[idx + (event.key === 'ArrowDown' ? 1 : -1)]?.focus();
        break;
      }
    }
  }
}
