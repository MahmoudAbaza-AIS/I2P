import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  inject,
} from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { TEXT_PLACEHOLDER_ROLES } from '../../models/symbol-part.model';
import { Backdrop, SymbolDesignerStore } from '../../state/symbol-designer.store';
import { DesignerIconComponent } from '../designer-icon/designer-icon.component';

@Component({
  selector: 'app-designer-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styleUrl: './designer-toolbar.component.css',
  imports: [TranslocoModule, DesignerIconComponent],
  template: `
    <div
      class="sd-toolbar"
      role="toolbar"
      [attr.aria-label]="'symbolDesigner.toolbar.label' | transloco"
    >
      <div
        class="sd-toolbar__group"
        role="group"
        [attr.aria-label]="'symbolDesigner.toolbar.file' | transloco"
      >
        <label class="sd-btn sd-btn--primary">
          <app-designer-icon name="import" />
          <span>{{ 'symbolDesigner.toolbar.import' | transloco }}</span>
          <input
            class="sd-visually-hidden"
            type="file"
            accept=".svg,image/svg+xml"
            (change)="onFile($event)"
          />
        </label>
        <button
          type="button"
          class="sd-btn"
          [disabled]="!store.hasDocument()"
          (click)="store.exportFiles()"
        >
          <app-designer-icon name="export" />
          <span>{{ 'symbolDesigner.toolbar.export' | transloco }}</span>
        </button>
      </div>

      <div
        class="sd-toolbar__group"
        role="group"
        [attr.aria-label]="'symbolDesigner.toolbar.history' | transloco"
      >
        <button
          type="button"
          class="sd-btn sd-btn--icon"
          [disabled]="!store.canUndo()"
          (click)="store.undo()"
          [attr.aria-label]="'symbolDesigner.toolbar.undo' | transloco"
          [title]="('symbolDesigner.toolbar.undo' | transloco) + ' (' + undoKeys + ')'"
        >
          <app-designer-icon name="undo" />
        </button>
        <button
          type="button"
          class="sd-btn sd-btn--icon"
          [disabled]="!store.canRedo()"
          (click)="store.redo()"
          [attr.aria-label]="'symbolDesigner.toolbar.redo' | transloco"
          [title]="('symbolDesigner.toolbar.redo' | transloco) + ' (' + redoKeys + ')'"
        >
          <app-designer-icon name="redo" />
        </button>
      </div>

      <div
        class="sd-toolbar__group"
        role="group"
        [attr.aria-label]="'symbolDesigner.toolbar.add' | transloco"
      >
        @for (role of roles; track role) {
          <button
            type="button"
            class="sd-btn"
            [disabled]="!store.hasDocument()"
            (click)="store.addText(role)"
            [title]="
              'symbolDesigner.toolbar.addHint'
                | transloco: { role: ('symbolDesigner.roles.' + role | transloco) }
            "
          >
            <app-designer-icon name="plus" />
            <span>{{ 'symbolDesigner.roles.' + role | transloco }}</span>
          </button>
        }
      </div>

      <div
        class="sd-toolbar__group"
        role="group"
        [attr.aria-label]="'symbolDesigner.toolbar.arrange' | transloco"
      >
        <button
          type="button"
          class="sd-btn"
          [disabled]="!store.canGroup()"
          (click)="store.group()"
          [title]="'symbolDesigner.toolbar.groupHint' | transloco"
        >
          <app-designer-icon name="group" /><span>{{
            'symbolDesigner.toolbar.group' | transloco
          }}</span>
        </button>
        <button
          type="button"
          class="sd-btn"
          [disabled]="!store.canUngroup()"
          (click)="store.ungroup()"
        >
          <app-designer-icon name="ungroup" /><span>{{
            'symbolDesigner.toolbar.ungroup' | transloco
          }}</span>
        </button>
        <button
          type="button"
          class="sd-btn"
          [disabled]="!store.canGroupAll()"
          (click)="store.groupAll()"
          [title]="'symbolDesigner.toolbar.groupAllHint' | transloco"
        >
          <app-designer-icon name="layers" /><span>{{
            'symbolDesigner.toolbar.groupAll' | transloco
          }}</span>
        </button>
        <button
          type="button"
          class="sd-btn sd-btn--danger"
          [disabled]="!store.canDelete()"
          (click)="store.deleteSelected()"
          [title]="('symbolDesigner.toolbar.delete' | transloco) + ' (Delete)'"
        >
          <app-designer-icon name="trash" /><span>{{
            'symbolDesigner.toolbar.delete' | transloco
          }}</span>
        </button>
      </div>

      <div
        class="sd-toolbar__group sd-toolbar__group--end"
        role="group"
        [attr.aria-label]="'symbolDesigner.toolbar.view' | transloco"
      >
        <button
          type="button"
          class="sd-btn sd-btn--icon"
          [disabled]="!store.hasDocument()"
          (click)="store.zoomOut()"
          [attr.aria-label]="'symbolDesigner.toolbar.zoomOut' | transloco"
          [title]="'symbolDesigner.toolbar.zoomOut' | transloco"
        >
          <app-designer-icon name="zoomOut" />
        </button>
        <output
          class="sd-toolbar__zoom sd-ltr"
          [attr.aria-label]="'symbolDesigner.toolbar.zoomLevel' | transloco"
          >{{ zoomPercent() }}%</output
        >
        <button
          type="button"
          class="sd-btn sd-btn--icon"
          [disabled]="!store.hasDocument()"
          (click)="store.zoomIn()"
          [attr.aria-label]="'symbolDesigner.toolbar.zoomIn' | transloco"
          [title]="'symbolDesigner.toolbar.zoomIn' | transloco"
        >
          <app-designer-icon name="zoomIn" />
        </button>
        <button
          type="button"
          class="sd-btn sd-btn--icon"
          [disabled]="!store.hasDocument()"
          (click)="store.resetView()"
          [attr.aria-label]="'symbolDesigner.toolbar.resetView' | transloco"
          [title]="'symbolDesigner.toolbar.resetView' | transloco"
        >
          <app-designer-icon name="fit" />
        </button>
        <label class="sd-toolbar__backdrop">
          <span class="sd-visually-hidden">{{
            'symbolDesigner.toolbar.backdrop' | transloco
          }}</span>
          <select
            class="sd-input"
            [value]="store.backdrop()"
            (change)="onBackdrop($event)"
            [title]="'symbolDesigner.toolbar.backdrop' | transloco"
          >
            @for (b of backdrops; track b) {
              <option [value]="b" [selected]="store.backdrop() === b">
                {{ 'symbolDesigner.backdrop.' + b | transloco }}
              </option>
            }
          </select>
        </label>
      </div>
    </div>
  `,
})
export class DesignerToolbarComponent {
  protected readonly store = inject(SymbolDesignerStore);
  protected readonly roles = TEXT_PLACEHOLDER_ROLES;
  protected readonly backdrops: readonly Backdrop[] = ['theme', 'inverse', 'checker'];
  protected readonly zoomPercent = computed(() => Math.round(this.store.viewport().zoom * 100));
  protected readonly undoKeys = 'Ctrl+Z';
  protected readonly redoKeys = 'Ctrl+Y';

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void this.store.importFile(file);
    input.value = '';
  }

  protected onBackdrop(event: Event): void {
    this.store.backdrop.set((event.target as HTMLSelectElement).value as Backdrop);
  }
}
