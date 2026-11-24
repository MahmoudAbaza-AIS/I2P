import {
  ChangeDetectionStrategy,
  ViewEncapsulation,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { closestPart, hasLockedAncestor } from '../../services/symbol-breakdown.service';
import { SymbolGeometry } from '../../services/symbol-edit.service';
import { SymbolDesignerStore } from '../../state/symbol-designer.store';
import { viewportCss } from '../../utils/viewport';
import { EmptyStateComponent } from '../../../../shared/state/empty-state.component';
import { ErrorStateComponent } from '../../../../shared/state/error-state.component';
import { LoadingStateComponent } from '../../../../shared/state/loading-state.component';

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly kind: 'selected' | 'primary' | 'hover';
}

type Gesture =
  | { kind: 'pan'; lastX: number; lastY: number; moved: boolean; background: boolean }
  | {
      kind: 'drag';
      lastX: number;
      lastY: number;
      startX: number;
      startY: number;
      moved: boolean;
      key: string;
    };

const DRAG_THRESHOLD_PX = 3;
const WHEEL_ZOOM = 1.1;

/** Live SVG geometry for commands (rotation pivot). Safe for hidden / unrendered nodes. */
const liveGeometry: SymbolGeometry = {
  localBBox(el) {
    try {
      const box = (el as SVGGraphicsElement).getBBox?.();
      return box && Number.isFinite(box.width)
        ? { x: box.x, y: box.y, width: box.width, height: box.height }
        : null;
    } catch {
      return null;
    }
  },
};

@Component({
  selector: 'app-symbol-canvas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styleUrl: './symbol-canvas.component.css',
  imports: [TranslocoModule, EmptyStateComponent, ErrorStateComponent, LoadingStateComponent],
  template: `
    <div
      #host
      class="sd-canvas"
      [class]="'sd-canvas sd-canvas--' + store.backdrop()"
      [class.sd-canvas--over-part]="!!store.hoveredId()"
      [class.sd-canvas--panning]="panning()"
      tabindex="0"
      role="application"
      [attr.aria-label]="'symbolDesigner.canvas.label' | transloco"
      [attr.aria-describedby]="'sd-canvas-help'"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)"
      (pointercancel)="endGesture()"
      (pointerleave)="onPointerLeave()"
      (wheel)="onWheel($event)"
    >
      <div class="sd-canvas__viewport" [style.transform]="transform()">
        <!-- The symbol is mounted here as-is: never mirrored or re-themed (rule 3c). -->
        <div #mount class="sd-canvas__symbol"></div>
      </div>
      <svg class="sd-canvas__overlay" aria-hidden="true">
        @for (b of boxes(); track $index) {
          <rect
            [attr.x]="b.x"
            [attr.y]="b.y"
            [attr.width]="b.w"
            [attr.height]="b.h"
            [attr.class]="'sd-canvas__box sd-canvas__box--' + b.kind"
          />
        }
      </svg>

      @switch (store.loadState()) {
        @case ('idle') {
          <div class="sd-canvas__state">
            <app-empty-state
              [heading]="'symbolDesigner.canvas.emptyHeading' | transloco"
              [message]="'symbolDesigner.canvas.emptyMessage' | transloco"
            />
          </div>
        }
        @case ('loading') {
          <div class="sd-canvas__state">
            <app-loading-state [label]="'symbolDesigner.canvas.loading' | transloco" />
          </div>
        }
        @case ('error') {
          <div class="sd-canvas__state">
            <app-error-state
              [heading]="'symbolDesigner.canvas.errorHeading' | transloco"
              [message]="'symbolDesigner.errors.' + store.loadError() | transloco"
              [showRetry]="false"
            />
          </div>
        }
      }
    </div>
    <p id="sd-canvas-help" class="sd-visually-hidden">
      {{ 'symbolDesigner.canvas.help' | transloco }}
    </p>
  `,
})
export class SymbolCanvasComponent {
  protected readonly store = inject(SymbolDesignerStore);
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly mount = viewChild.required<ElementRef<HTMLDivElement>>('mount');

  protected readonly boxes = signal<readonly Box[]>([]);
  protected readonly panning = signal(false);
  protected readonly transform = computed(() => viewportCss(this.store.viewport()));
  private gesture: Gesture | null = null;
  private frame = 0;

  constructor() {
    this.store.geometry = liveGeometry;
    const destroyRef = inject(DestroyRef);

    // Mount the live document (no clone per change, unlike the POC).
    effect(() => {
      const doc = this.store.doc();
      const mount = this.mount().nativeElement;
      if (doc) {
        if (mount.firstChild !== doc.root) mount.replaceChildren(doc.root);
      } else {
        mount.replaceChildren();
      }
    });

    // Re-draw selection / hover outlines after any relevant change.
    effect(() => {
      this.store.revision();
      this.store.selection();
      this.store.hoveredId();
      this.store.viewport();
      this.store.doc();
      untracked(() => this.scheduleOverlay());
    });

    const resize =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            const rect = this.host().nativeElement.getBoundingClientRect();
            this.store.canvasSize = { width: rect.width, height: rect.height };
            this.scheduleOverlay();
          });
    queueMicrotask(() => resize?.observe(this.host().nativeElement));
    destroyRef.onDestroy(() => {
      resize?.disconnect();
      cancelAnimationFrame(this.frame);
      this.mount().nativeElement.replaceChildren();
    });
  }

  private scheduleOverlay(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.boxes.set(this.computeBoxes()));
  }

  private computeBoxes(): Box[] {
    const b = this.store.breakdown();
    if (!b) return [];
    const origin = this.host().nativeElement.getBoundingClientRect();
    const box = (id: string, kind: Box['kind']): Box | null => {
      const el = b.byId.get(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      const pad = kind === 'hover' ? 1 : 3;
      return {
        x: r.left - origin.left - pad,
        y: r.top - origin.top - pad,
        w: r.width + pad * 2,
        h: r.height + pad * 2,
        kind,
      };
    };
    const out: Box[] = [];
    const primary = this.store.primaryId();
    const hovered = this.store.hoveredId();
    if (hovered && !this.store.selection().includes(hovered)) {
      const h = box(hovered, 'hover');
      if (h) out.push(h);
    }
    for (const id of this.store.selection()) {
      const s = box(id, id === primary ? 'primary' : 'selected');
      if (s) out.push(s);
    }
    return out;
  }

  /** Part element under a pointer target (deepest part wins, POC rule). */
  private partAt(target: EventTarget | null): Element | null {
    const doc = this.store.doc();
    const b = this.store.breakdown();
    if (!doc || !b || !(target instanceof Element) || !doc.root.contains(target)) return null;
    return closestPart(target, b.partOf, doc.root);
  }

  private partId(el: Element | null): string | null {
    return el ? (this.store.breakdown()?.partOf.get(el)?.id ?? null) : null;
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.button !== 1) return;
    const hostEl = this.host().nativeElement;
    hostEl.focus({ preventScroll: true });
    const part = event.button === 0 ? this.partAt(event.target) : null;
    const id = this.partId(part);
    const doc = this.store.doc();

    if (!part || !id || !doc) {
      this.gesture = {
        kind: 'pan',
        lastX: event.clientX,
        lastY: event.clientY,
        moved: false,
        background: event.button === 0,
      };
    } else if (event.ctrlKey || event.metaKey) {
      this.store.select(id, true);
      return;
    } else {
      if (!this.store.selection().includes(id)) this.store.select(id);
      if (hasLockedAncestor(part, doc)) return;
      this.gesture = {
        kind: 'drag',
        lastX: event.clientX,
        lastY: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        key: this.store.beginDrag(),
      };
    }
    hostEl.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  protected onPointerMove(event: PointerEvent): void {
    const g = this.gesture;
    if (!g) {
      this.store.hoveredId.set(this.partId(this.partAt(event.target)));
      return;
    }
    const dx = event.clientX - g.lastX;
    const dy = event.clientY - g.lastY;
    if (g.kind === 'pan') {
      if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      g.moved = true;
      this.panning.set(true);
      this.store.panBy(dx, dy);
    } else {
      if (
        !g.moved &&
        Math.hypot(event.clientX - g.startX, event.clientY - g.startY) < DRAG_THRESHOLD_PX
      )
        return;
      g.moved = true;
      this.store.dragBy(this.parentDeltas(dx, dy), g.key);
    }
    g.lastX = event.clientX;
    g.lastY = event.clientY;
  }

  /** Convert a screen delta into each selected element's parent coordinate space. */
  private parentDeltas(dx: number, dy: number): Map<Element, { dx: number; dy: number }> {
    const deltas = new Map<Element, { dx: number; dy: number }>();
    for (const el of this.store.selectedElements()) {
      const parent = el.parentElement as unknown as SVGGraphicsElement | null;
      const m = parent?.getScreenCTM?.()?.inverse();
      deltas.set(el, m ? { dx: m.a * dx + m.c * dy, dy: m.b * dx + m.d * dy } : { dx, dy });
    }
    return deltas;
  }

  protected onPointerUp(event: PointerEvent): void {
    const g = this.gesture;
    if (g?.kind === 'pan' && !g.moved && g.background && !(event.ctrlKey || event.metaKey)) {
      this.store.clearSelection();
    }
    this.endGesture();
  }

  protected onPointerLeave(): void {
    if (!this.gesture) this.store.hoveredId.set(null);
  }

  protected endGesture(): void {
    this.gesture = null;
    this.panning.set(false);
  }

  protected onWheel(event: WheelEvent): void {
    if (!this.store.hasDocument()) return;
    event.preventDefault();
    const rect = this.host().nativeElement.getBoundingClientRect();
    const factor = event.deltaY < 0 ? WHEEL_ZOOM : 1 / WHEEL_ZOOM;
    this.store.zoomBy(factor, { x: event.clientX - rect.left, y: event.clientY - rect.top });
  }
}
