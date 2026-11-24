import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Stroke icons on a 24×24 grid, drawn with `currentColor` so they follow the theme. */
const ICONS = {
  import: ['M12 15V4', 'M7.5 8.5 12 4l4.5 4.5', 'M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4'],
  export: ['M12 4v11', 'M7.5 10.5 12 15l4.5-4.5', 'M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4'],
  undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  redo: ['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
  zoomIn: ['M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0', 'M20.5 20.5 16 16', 'M11 8v6', 'M8 11h6'],
  zoomOut: ['M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0', 'M20.5 20.5 16 16', 'M8 11h6'],
  fit: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  eyeOff: [
    'M3 3l18 18',
    'M10.6 5.1Q11.3 5 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2',
    'M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6',
  ],
  lock: [
    'M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z',
    'M8 11V7a4 4 0 0 1 8 0v4',
  ],
  unlock: [
    'M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z',
    'M8 11V7a4 4 0 0 1 7.9-1',
  ],
  up: ['M12 19V5', 'M5.5 11.5 12 5l6.5 6.5'],
  down: ['M12 5v14', 'M18.5 12.5 12 19l-6.5-6.5'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  chevron: ['M9 6l6 6-6 6'],
  group: ['M4 4h7v7H4z', 'M13 13h7v7h-7z', 'M2 2h20v20H2z'],
  ungroup: ['M4 4h7v7H4z', 'M13 13h7v7h-7z'],
  layers: ['M12 3 2 8l10 5 10-5-10-5z', 'M2 16l10 5 10-5', 'M2 12l10 5 10-5'],
  text: ['M5 7V4h14v3', 'M12 4v16', 'M9 20h6'],
  shape: ['M12 3l9 9-9 9-9-9z'],
  image: ['M4 4h16v16H4z', 'M4 16l5-5 4 4 3-3 4 4', 'M17 8.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0'],
  link: [
    'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1',
    'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  ],
  plus: ['M12 5v14', 'M5 12h14'],
  gauge: ['M4 16a8 8 0 1 1 16 0', 'M12 16l4-5'],
} as const;

export type DesignerIconName = keyof typeof ICONS;

/** Icons that point in the reading direction and must mirror in RTL (rule 3b). */
const DIRECTIONAL: ReadonlySet<DesignerIconName> = new Set(['undo', 'redo', 'chevron']);

@Component({
  selector: 'app-designer-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sd-icon', '[class.sd-flip-rtl]': 'directional()', 'aria-hidden': 'true' },
  template: `
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
    >
      @for (d of paths(); track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
})
export class DesignerIconComponent {
  readonly name = input.required<DesignerIconName>();
  protected readonly paths = computed(() => ICONS[this.name()]);
  protected readonly directional = computed(() => DIRECTIONAL.has(this.name()));
}
