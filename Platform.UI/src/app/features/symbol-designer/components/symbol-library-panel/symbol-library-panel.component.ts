import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoModule } from '@jsverse/transloco';
import { catchError, map, of, startWith } from 'rxjs';
import { SymbolLibraryEntry } from '../../models/symbol.model';
import { SymbolLibraryService } from '../../services/symbol-library.service';
import { SymbolDesignerStore } from '../../state/symbol-designer.store';
import { LoadingStateComponent } from '../../../../shared/state/loading-state.component';

type Manifest =
  { state: 'loading' } | { state: 'error' } | { state: 'ready'; entries: SymbolLibraryEntry[] };

interface Category {
  readonly key: string;
  readonly entries: readonly SymbolLibraryEntry[];
}

/** Category folders with translations; unknown folders fall back to the folder name. */
const KNOWN_CATEGORIES = new Set([
  'chart-parts',
  'charts',
  'counters',
  'icons',
  'illustrations',
  'kpi-cards',
  'legends',
  'photos',
  'shapes',
]);

@Component({
  selector: 'app-symbol-library-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styleUrl: './symbol-library-panel.component.css',
  imports: [TranslocoModule, LoadingStateComponent],
  template: `
    <section class="sd-panel sd-library" aria-labelledby="sd-library-title">
      <header class="sd-panel__head">
        <div>
          <h2 id="sd-library-title" class="sd-panel__title">
            {{ 'symbolDesigner.library.title' | transloco }}
          </h2>
          <p class="sd-panel__subtitle">{{ 'symbolDesigner.library.subtitle' | transloco }}</p>
        </div>
      </header>
      <label class="sd-field">
        <span class="sd-visually-hidden">{{ 'symbolDesigner.library.search' | transloco }}</span>
        <input
          class="sd-input"
          type="search"
          dir="auto"
          [value]="query()"
          (input)="onQuery($event)"
          [placeholder]="'symbolDesigner.library.search' | transloco"
        />
      </label>

      <div class="sd-library__list">
        @if (store.imported().length) {
          <details class="sd-library__group" open>
            <summary>
              {{ 'symbolDesigner.library.imported' | transloco }}
              <span class="sd-badge sd-ltr">{{ store.imported().length }}</span>
            </summary>
            <ul role="list">
              @for (item of store.imported(); track item.id) {
                <li>
                  <button
                    type="button"
                    class="sd-library__item"
                    [class.sd-library__item--active]="store.activeSource() === item.id"
                    [attr.aria-current]="store.activeSource() === item.id ? 'true' : null"
                    (click)="store.openImported(item)"
                  >
                    <span class="sd-library__thumb sd-library__thumb--file" aria-hidden="true"
                      >SVG</span
                    >
                    <span class="sd-library__name" dir="auto">{{ item.name }}</span>
                  </button>
                </li>
              }
            </ul>
          </details>
        }

        @switch (manifest().state) {
          @case ('loading') {
            <app-loading-state [label]="'symbolDesigner.library.loading' | transloco" />
          }
          @case ('error') {
            <p class="sd-hint sd-hint--warn" role="alert">
              {{ 'symbolDesigner.library.error' | transloco }}
            </p>
          }
          @case ('ready') {
            @for (cat of categories(); track cat.key) {
              <details class="sd-library__group" [open]="query().length > 0">
                <summary>
                  {{
                    isKnown(cat.key)
                      ? ('symbolDesigner.library.categories.' + cat.key | transloco)
                      : cat.key
                  }}
                  <span class="sd-badge sd-ltr">{{ cat.entries.length }}</span>
                </summary>
                <ul role="list">
                  @for (entry of cat.entries; track entry.url) {
                    <li>
                      <button
                        type="button"
                        class="sd-library__item"
                        [class.sd-library__item--active]="store.activeSource() === entry.url"
                        [attr.aria-current]="store.activeSource() === entry.url ? 'true' : null"
                        [title]="entry.file"
                        (click)="store.openLibraryEntry(entry)"
                      >
                        <img
                          class="sd-library__thumb"
                          [src]="library.assetUrl(entry)"
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                        <span class="sd-library__name" dir="auto">{{ entry.name }}</span>
                        <span class="sd-library__size sd-ltr">{{ entry.sizeKb }} KB</span>
                      </button>
                    </li>
                  }
                </ul>
              </details>
            } @empty {
              <p class="sd-hint">{{ 'symbolDesigner.library.noMatches' | transloco }}</p>
            }
          }
        }
      </div>
    </section>
  `,
})
export class SymbolLibraryPanelComponent {
  protected readonly store = inject(SymbolDesignerStore);
  protected readonly library = inject(SymbolLibraryService);
  protected readonly query = signal('');

  protected readonly manifest = toSignal(
    this.library.entries().pipe(
      map((entries): Manifest => ({ state: 'ready', entries })),
      startWith<Manifest>({ state: 'loading' }),
      catchError(() => of<Manifest>({ state: 'error' })),
    ),
    { initialValue: { state: 'loading' } as Manifest },
  );

  protected readonly categories = computed<Category[]>(() => {
    const m = this.manifest();
    if (m.state !== 'ready') return [];
    const q = this.query().trim().toLowerCase();
    const groups = new Map<string, SymbolLibraryEntry[]>();
    for (const e of m.entries) {
      if (q && !e.name.toLowerCase().includes(q) && !e.file.toLowerCase().includes(q)) continue;
      groups.set(e.category, [...(groups.get(e.category) ?? []), e]);
    }
    return [...groups].map(([key, entries]) => ({ key, entries }));
  });

  protected isKnown(key: string): boolean {
    return KNOWN_CATEGORIES.has(key);
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}
