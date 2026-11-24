import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { EditTransform, SYMBOL_ROLES, SymbolElementRole } from '../../models/symbol-part.model';
import { StylePatch } from '../../services/symbol-edit.service';
import { SymbolDesignerStore } from '../../state/symbol-designer.store';
import { DesignerIconComponent } from '../designer-icon/designer-icon.component';

/** POC option lists. Font names are technical values and stay untranslated. */
const FONT_FAMILIES = [
  ['Arial, sans-serif', 'Arial'],
  ['Inter, sans-serif', 'Inter'],
  ['Roboto, sans-serif', 'Roboto'],
  ['Tahoma, sans-serif', 'Tahoma'],
  ['Verdana, sans-serif', 'Verdana'],
  ['Georgia, serif', 'Georgia'],
  ['monospace', 'Monospace'],
] as const;
const FONT_WEIGHTS = ['normal', 'bold', '600', '300'] as const;
const FONT_STYLES = ['normal', 'italic', 'oblique'] as const;
const TEXT_ANCHORS = ['start', 'middle', 'end'] as const;
const TEXT_DECORATIONS = ['none', 'underline', 'line-through', 'overline'] as const;

let uid = 0;

@Component({
  selector: 'app-properties-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styleUrl: './properties-panel.component.css',
  imports: [TranslocoModule, DesignerIconComponent],
  template: `
    <section class="sd-panel sd-props" [attr.aria-labelledby]="id + '-title'">
      <header class="sd-panel__head">
        <div>
          <h2 [id]="id + '-title'" class="sd-panel__title">
            {{ 'symbolDesigner.props.title' | transloco }}
          </h2>
          <p class="sd-panel__subtitle">{{ 'symbolDesigner.props.subtitle' | transloco }}</p>
        </div>
      </header>

      <div class="sd-props__section">
        <h3 class="sd-props__heading">{{ 'symbolDesigner.props.symbol' | transloco }}</h3>
        <label class="sd-field">
          <span>{{ 'symbolDesigner.props.symbolName' | transloco }}</span>
          <input
            class="sd-input"
            dir="auto"
            [value]="store.symbolName()"
            [disabled]="!store.hasDocument()"
            [placeholder]="'symbolDesigner.props.symbolNamePlaceholder' | transloco"
            (input)="store.symbolName.set(value($event))"
          />
        </label>
      </div>

      <div class="sd-props__section">
        <div class="sd-panel__head">
          <h3 class="sd-props__heading">{{ 'symbolDesigner.props.selected' | transloco }}</h3>
          <span class="sd-badge sd-ltr">{{ store.selection().length }}</span>
        </div>

        @if (store.primaryPart(); as part) {
          @if (store.properties(); as p) {
            @if (store.selection().length > 1) {
              <p class="sd-hint">
                {{
                  'symbolDesigner.props.multiHint' | transloco: { count: store.selection().length }
                }}
              </p>
            }
            <div class="sd-props__id sd-ltr" [title]="'symbolDesigner.props.partId' | transloco">
              {{ part.id }} · &lt;{{ part.tag }}&gt;
            </div>

            <label class="sd-field">
              <span>{{ 'symbolDesigner.props.objectName' | transloco }}</span>
              <input
                class="sd-input"
                dir="auto"
                [value]="part.name"
                (input)="store.rename(value($event))"
              />
            </label>
            <label class="sd-field">
              <span>{{ 'symbolDesigner.props.role' | transloco }}</span>
              <select class="sd-input" (change)="store.setRole(asRole(value($event)))">
                @for (r of roles; track r) {
                  <option [value]="r" [selected]="part.role === r">
                    {{ 'symbolDesigner.roles.' + r | transloco }}
                  </option>
                }
              </select>
            </label>
            <p class="sd-hint">{{ 'symbolDesigner.props.roleHelp' | transloco }}</p>

            @if (p.tag === 'text') {
              <fieldset class="sd-props__group">
                <legend>{{ 'symbolDesigner.props.textContent' | transloco }}</legend>
                <label class="sd-field">
                  <span>{{ 'symbolDesigner.props.value' | transloco }}</span>
                  <textarea
                    class="sd-input"
                    rows="2"
                    dir="auto"
                    [value]="p.text"
                    (input)="store.setText(value($event))"
                  ></textarea>
                </label>
                <div class="sd-props__row">
                  <label class="sd-field"
                    ><span>{{ 'symbolDesigner.props.x' | transloco }}</span>
                    <input
                      class="sd-input sd-ltr"
                      type="number"
                      [value]="p.x"
                      (input)="onNumber($event, setX)"
                  /></label>
                  <label class="sd-field"
                    ><span>{{ 'symbolDesigner.props.y' | transloco }}</span>
                    <input
                      class="sd-input sd-ltr"
                      type="number"
                      [value]="p.y"
                      (input)="onNumber($event, setY)"
                  /></label>
                </div>
                <label class="sd-field"
                  ><span>{{ 'symbolDesigner.props.fontFamily' | transloco }}</span>
                  <select class="sd-input sd-ltr" (change)="style({ fontFamily: value($event) })">
                    @for (f of fonts; track f[0]) {
                      <option [value]="f[0]" [selected]="p.fontFamily === f[0]">{{ f[1] }}</option>
                    }
                  </select></label
                >
                <div class="sd-props__row">
                  <label class="sd-field"
                    ><span>{{ 'symbolDesigner.props.fontSize' | transloco }}</span>
                    <input
                      class="sd-input sd-ltr"
                      type="number"
                      min="1"
                      max="300"
                      [value]="p.fontSize"
                      (input)="onNumber($event, setFontSize)"
                  /></label>
                  <label class="sd-field"
                    ><span>{{ 'symbolDesigner.props.fontWeight' | transloco }}</span>
                    <select class="sd-input" (change)="style({ fontWeight: value($event) })">
                      @for (w of weights; track w) {
                        <option [value]="w" [selected]="p.fontWeight === w">
                          {{ 'symbolDesigner.props.weights.' + w | transloco }}
                        </option>
                      }
                    </select></label
                  >
                </div>
                <div class="sd-props__row">
                  <label class="sd-field"
                    ><span>{{ 'symbolDesigner.props.fontStyle' | transloco }}</span>
                    <select class="sd-input" (change)="style({ fontStyle: value($event) })">
                      @for (s of fontStyles; track s) {
                        <option [value]="s" [selected]="p.fontStyle === s">
                          {{ 'symbolDesigner.props.fontStyles.' + s | transloco }}
                        </option>
                      }
                    </select></label
                  >
                  <label class="sd-field"
                    ><span>{{ 'symbolDesigner.props.textAnchor' | transloco }}</span>
                    <select class="sd-input" (change)="style({ textAnchor: value($event) })">
                      @for (a of anchors; track a) {
                        <option [value]="a" [selected]="p.textAnchor === a">
                          {{ 'symbolDesigner.props.anchors.' + a | transloco }}
                        </option>
                      }
                    </select></label
                  >
                </div>
                <label class="sd-field"
                  ><span>{{ 'symbolDesigner.props.textDecoration' | transloco }}</span>
                  <select class="sd-input" (change)="style({ textDecoration: value($event) })">
                    @for (d of decorations; track d) {
                      <option [value]="d" [selected]="p.textDecoration === d">
                        {{ 'symbolDesigner.props.decorations.' + d | transloco }}
                      </option>
                    }
                  </select></label
                >
              </fieldset>
            }

            <fieldset class="sd-props__group">
              <legend>{{ 'symbolDesigner.props.appearance' | transloco }}</legend>
              @if (part.kind === 'group') {
                <label class="sd-check">
                  <input
                    type="checkbox"
                    [checked]="store.applyToChildren()"
                    (change)="store.applyToChildren.set(checked($event))"
                  />
                  <span>{{ 'symbolDesigner.props.applyToChildren' | transloco }}</span>
                </label>
              }
              <div class="sd-props__row">
                <label class="sd-field"
                  ><span>{{ 'symbolDesigner.props.fill' | transloco }}</span>
                  <span class="sd-color">
                    <input type="color" [value]="p.fill" (input)="style({ fill: value($event) })" />
                    <code class="sd-ltr">{{ p.fill }}</code>
                  </span></label
                >
                <label class="sd-field"
                  ><span>{{ 'symbolDesigner.props.stroke' | transloco }}</span>
                  <span class="sd-color">
                    <input
                      type="color"
                      [value]="p.stroke"
                      (input)="style({ stroke: value($event) })"
                    />
                    <code class="sd-ltr">{{ p.stroke }}</code>
                  </span></label
                >
              </div>
              <div class="sd-props__row">
                <label class="sd-field"
                  ><span>{{ 'symbolDesigner.props.strokeWidth' | transloco }}</span>
                  <input
                    class="sd-input sd-ltr"
                    type="number"
                    min="0"
                    max="50"
                    step="0.5"
                    [value]="p.strokeWidth"
                    (input)="onNumber($event, setStrokeWidth)"
                /></label>
                <label class="sd-field"
                  ><span>{{ 'symbolDesigner.props.opacity' | transloco }}</span>
                  <input
                    class="sd-input sd-ltr"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    [value]="p.opacity"
                    (input)="onNumber($event, setOpacity)"
                /></label>
              </div>
              <p class="sd-hint">{{ 'symbolDesigner.props.appearanceHelp' | transloco }}</p>
            </fieldset>

            <fieldset class="sd-props__group">
              <legend>{{ 'symbolDesigner.props.transform' | transloco }}</legend>
              <div class="sd-props__row">
                <label class="sd-field"
                  ><span>{{ 'symbolDesigner.props.translateX' | transloco }}</span>
                  <input
                    class="sd-input sd-ltr"
                    type="number"
                    step="1"
                    [value]="p.transform.translateX"
                    (input)="onNumber($event, transformSetter('translateX'))"
                /></label>
                <label class="sd-field"
                  ><span>{{ 'symbolDesigner.props.translateY' | transloco }}</span>
                  <input
                    class="sd-input sd-ltr"
                    type="number"
                    step="1"
                    [value]="p.transform.translateY"
                    (input)="onNumber($event, transformSetter('translateY'))"
                /></label>
              </div>
              <div class="sd-props__row">
                <label class="sd-field"
                  ><span>{{ 'symbolDesigner.props.scaleX' | transloco }}</span>
                  <input
                    class="sd-input sd-ltr"
                    type="number"
                    min="0.05"
                    max="20"
                    step="0.05"
                    [value]="p.transform.scaleX"
                    (input)="onNumber($event, transformSetter('scaleX'))"
                /></label>
                <label class="sd-field"
                  ><span>{{ 'symbolDesigner.props.scaleY' | transloco }}</span>
                  <input
                    class="sd-input sd-ltr"
                    type="number"
                    min="0.05"
                    max="20"
                    step="0.05"
                    [value]="p.transform.scaleY"
                    (input)="onNumber($event, transformSetter('scaleY'))"
                /></label>
              </div>
              <label class="sd-field"
                ><span>{{ 'symbolDesigner.props.rotation' | transloco }}</span>
                <input
                  class="sd-input sd-ltr"
                  type="number"
                  min="-360"
                  max="360"
                  [value]="p.transform.rotation"
                  (input)="onNumber($event, transformSetter('rotation'))"
              /></label>
            </fieldset>

            @if (p.gaugeApplicable) {
              <fieldset class="sd-props__group sd-props__group--accent">
                <legend>
                  <app-designer-icon name="gauge" /> {{ 'symbolDesigner.props.gauge' | transloco }}
                </legend>
                <label class="sd-field">
                  <span
                    >{{ 'symbolDesigner.props.gaugePercent' | transloco }}
                    <output class="sd-ltr">{{ gaugePercent() ?? p.gaugePercent }}%</output></span
                  >
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    [value]="gaugePercent() ?? p.gaugePercent"
                    (input)="gaugePercent.set(+value($event))"
                  />
                </label>
                <label class="sd-field"
                  ><span>{{ 'symbolDesigner.props.gaugeColor' | transloco }}</span>
                  <span class="sd-color">
                    <input
                      type="color"
                      [value]="gaugeColor() ?? p.gaugeColor"
                      (input)="gaugeColor.set(value($event))"
                    />
                    <code class="sd-ltr">{{ gaugeColor() ?? p.gaugeColor }}</code>
                  </span></label
                >
                <div class="sd-props__row">
                  <button
                    type="button"
                    class="sd-btn sd-btn--primary"
                    (click)="
                      store.applyGauge(
                        gaugePercent() ?? p.gaugePercent,
                        gaugeColor() ?? p.gaugeColor
                      )
                    "
                  >
                    {{ 'symbolDesigner.props.gaugeApply' | transloco }}
                  </button>
                  <button type="button" class="sd-btn" (click)="store.clearGauge()">
                    {{ 'symbolDesigner.props.gaugeClear' | transloco }}
                  </button>
                </div>
                <p class="sd-hint">{{ 'symbolDesigner.props.gaugeHelp' | transloco }}</p>
              </fieldset>
            }
          }
        } @else {
          <div class="sd-panel__empty">
            <app-designer-icon name="shape" />
            <strong>{{ 'symbolDesigner.props.noSelectionHeading' | transloco }}</strong>
            <small>{{ 'symbolDesigner.props.noSelectionMessage' | transloco }}</small>
          </div>
        }
      </div>
    </section>
  `,
})
export class PropertiesPanelComponent {
  protected readonly store = inject(SymbolDesignerStore);
  protected readonly id = `sd-props-${++uid}`;
  protected readonly roles = SYMBOL_ROLES;
  protected readonly fonts = FONT_FAMILIES;
  protected readonly weights = FONT_WEIGHTS;
  protected readonly fontStyles = FONT_STYLES;
  protected readonly anchors = TEXT_ANCHORS;
  protected readonly decorations = TEXT_DECORATIONS;

  /** Pending gauge inputs (applied on button press, as in the POC); reset on selection change. */
  protected readonly gaugePercent = signal<number | null>(null);
  protected readonly gaugeColor = signal<string | null>(null);

  constructor() {
    effect(() => {
      this.store.primaryId();
      untracked(() => {
        this.gaugePercent.set(null);
        this.gaugeColor.set(null);
      });
    });
  }

  protected readonly setX = (x: number) =>
    this.store.setPosition(x, this.store.properties()?.y ?? 0);
  protected readonly setY = (y: number) =>
    this.store.setPosition(this.store.properties()?.x ?? 0, y);
  protected readonly setFontSize = (v: number) => this.style({ fontSize: v });
  protected readonly setStrokeWidth = (v: number) => this.style({ strokeWidth: v });
  protected readonly setOpacity = (v: number) => this.style({ opacity: v });

  protected transformSetter(key: keyof EditTransform): (v: number) => void {
    return (v) => this.store.setTransform({ [key]: v });
  }

  protected style(patch: StylePatch): void {
    this.store.setStyle(patch);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  protected asRole(value: string): SymbolElementRole {
    return SYMBOL_ROLES.find((r) => r === value) ?? 'graphic';
  }

  protected onNumber(event: Event, apply: (v: number) => void): void {
    const raw = (event.target as HTMLInputElement).value;
    if (raw.trim() === '') return;
    const n = Number(raw);
    if (Number.isFinite(n)) apply(n);
  }
}
