# Symbol Designer Integration: Platform.UI (I2P)

> **How to use this file**
> Open Claude Code in `Platform.UI` and say:
> **"Read SYMBOL_DESIGNER_INTEGRATION.md and execute it phase by phase. Stop at each checkpoint and report."**
> The file is both the brief and the working log. The agent fills in the `FINDINGS` blocks as it goes.

**Status (2026-11-23):** Phases 1–5 implemented. Automated checks for all five checkpoints pass. The **manual visual pass in a browser** (four theme/language combinations, real pointer interaction) is still **pending**; the user will run the app. See the checkpoint results under each phase and the log in section 9.

---

## 0. Role and goal

You are a senior full-stack developer working mainly on the Angular frontend of the I2P SCADA platform (`Platform.UI`). You know Angular (standalone components, signals or RxJS, lazy routes), SVG manipulation, and SCADA/HMI symbol conventions.

**Goal:** bring the Symbol Designer concept, built as a standalone POC, into `Platform.UI` as a new **tab**. Users can import, break down, adjust and export SCADA symbols there. The designer's structure, algorithms and interaction concepts carry over. The **visual language, color theme and navigation flow must be I2P's**.

---

## 1. Paths

| Role | Path | Rule |
|---|---|---|
| Reference concept (read-only) | `C:\Work\I2P\POCs\scada-symbol-designer-phase2-enhancements2\scada-symbol-designer-phase2-enhancements2\scada-symbol-designer-standalone` | Never modify |
| Target app | `C:\Work\I2P\Main App\Project\Platform.UI` | Work here |
| Sample SVG symbols (test data) | `C:\Work\I2P\Main App\Project\Platform.UI\public\Executive Dashboard\Symbols` | Never modify the originals; work on copies or in memory |

---

## 2. Ground rules

1. **I2P wins on look and flow.** Where the standalone's styling or navigation conflicts with I2P's, use I2P's and log it in section 9.
2. **The standalone's structure and algorithms win on designer behavior.** Port the logic; don't reinvent it.
3. Follow Platform.UI conventions: Angular version, naming, lint and format rules, folder layout, existing shared components and theme tokens.
3a. **Dark mode and light mode are both required.** Use I2P's theme tokens and its existing theme-switching mechanism. Every panel, control, canvas background, selection outline, handle and state color must work in both modes. No hard-coded colors, and no styles that assume a light background.
3b. **Arabic and English are both required, including RTL.** Use I2P's existing i18n mechanism and translation files. Do not add a second one. All UI text (labels, tooltips, errors, empty states, toolbar, shortcuts hints) goes through translation keys, with both `en` and `ar` entries. Use logical CSS properties (`margin-inline-start`, `inset-inline-end`, etc.) instead of left/right. Panels, toolbars, icons with direction (undo/redo, arrows, chevrons) and the parts tree must mirror correctly in RTL.
3c. **The symbol itself is not UI.** The canvas content (the SVG being edited) must never be mirrored or re-themed by the language or mode switch. Only the surrounding chrome changes. The canvas background and guides may follow the theme, but must not alter how the symbol's own colors are shown or exported.
4. No new dependencies unless there is no reasonable alternative. Justify any in section 9.
5. Don't touch unrelated parts of the app.
6. Keep logic out of components. Algorithms go in pure, typed, unit-testable services or utilities.
7. If something is ambiguous, pick the I2P-consistent option, log it, and continue. Ask only if it blocks the work.

---

## 3. Phase 1: Discovery (read only, no code changes)

### 3.1 Standalone designer

> **FINDINGS: standalone**
>
> **Stack and structure.** Angular 21, standalone, signals; no backend, no state library. It is effectively a **single 700-line component** with one helper service:
>
> | File | Lines | Content |
> |---|---|---|
> | `src/app/symbol-designer/symbol-designer.component.ts` | 699 | All state (~30 signals), all editing logic, pointer handling, export |
> | `src/app/symbol-designer/symbol-designer.component.html` | 201 | 3-column layout: toolbox / canvas / (layers + properties) |
> | `src/app/symbol-designer/symbol-designer.component.css` | 138 | Hard-coded light palette, 3 stacked "phase" overrides |
> | `src/app/symbol-designer/svg-editor.service.ts` | 84 | `parseAndSanitize`, `createText`, `viewBox`, `serialize` |
> | `src/app/symbol-designer/symbol.models.ts` | 48 | `SymbolLayer`, `SymbolElementMetadata`, `SymbolDefinition` (JSON schema v1) |
>
> **State model.** The live SVG DOM (`svgRoot`, an imported detached `SVGSVGElement`) is the single source of truth. Editor state is stored *on the DOM* as `data-*` attributes (`data-symbol-element`, `data-role`, `data-name`, `data-hidden`, `data-locked`, `data-editor-selected`, `data-editor-base-transform`, `data-editor-offset-x/y`, `data-drag-start-*`, `data-gauge-progress`). After every mutation `refresh()` re-serializes the whole SVG, **deep-clones it into the canvas**, and rebuilds the layer list.
>
> **Algorithms**
>
> | Algorithm | Where | In → out | Notes / edge cases |
> |---|---|---|---|
> | Import + sanitize | `svg-editor.service.ts:7` `parseAndSanitize` | SVG text → detached `SVGSVGElement` | `DOMParser('image/svg+xml')`; rejects `parsererror` / non-`svg` root. Removes `script, foreignObject, iframe, object, embed`; all `on*` attributes; `href`/`*:href` unless `#…` or `data:image/…`; any attribute containing `url(` that is not `url(#`. Adds `xmlns`. Missing viewBox → `0 0 width height` (`parseFloat`, so units are silently dropped; default 300×200). Component adds: `.svg` extension check, **5 MB limit**. Gaps: `<style>` contents (`@import`, `url(http…)`) not checked; `<animate>/<set>` targeting `href` not checked; DOCTYPE/entities not stripped. |
> | Breakdown | `component.ts:515` `decorateSelectableElements` + `:563` `rebuildLayers` | DOM → flat `SymbolLayer[]` with `depth` | Every `text, path, rect, circle, ellipse, line, polyline, polygon, image, g` becomes a part. Missing ids get `element-${randomUUID().slice(0,8)}` → **non-deterministic**, and the id is written into the exported SVG. Decorates elements inside `<defs>/<clipPath>/<mask>` too (harmless for the tree because `rebuildLayers` only descends `g`, but they still receive random ids). `<use>` is **not** a part, so `<use>`-based artwork (11 samples) is unselectable. Names: `data-name` → text content (≤28 chars) → `id` → capitalized tag. Tree order: children reversed (topmost painted first). Only expanded groups are walked. Complexity O(n) per rebuild, but rebuild runs on every change. |
> | Selection / hit-test | `:108` `onCanvasClick`, `:203` `selectLayer` | click target → `selectedIds` | `closest('[data-symbol-element]')`, so the deepest part wins (clicking inside a group selects the leaf). Ctrl/Cmd toggles. Primary = first selected. Highlight = injected `<style>` with blue `drop-shadow` filter on `[data-editor-selected]` (lives inside the symbol). `getElement(id)` is an O(n) scan. |
> | Drag (move) | `:128–201` pointer handlers | pointer delta in SVG units (`getScreenCTM().inverse()`) | Elements with `x`/`y` attributes move by attributes (rounded to 0.1); others get `translate(dx dy)` prepended to the stored base transform. Locked ancestors block drag. No history. |
> | Style edit | `:304` `applyAppearance`, `:324` `updateSelected` | form signals → attributes | fill, stroke + stroke-width (width 0 removes stroke), opacity (clamped 0–1), font family/size/weight/style/anchor/decoration for `<text>`. "Apply to all group children" pushes the style onto every descendant shape. Writes presentation attributes; inline `style="fill:…"` in the source would override them (22 samples use `style=`). |
> | Transform edit | `:348` `applyTransformProperties`, readback `:625` | scaleX/Y (0.05–20), rotation → `transform` | Composes `translate(offset) rotate(r) scale(sx sy) <base>`. Rotation/scale are about the **user-space origin (0,0)**, not the part's centre, so parts "fly" when rotated. Readback is regex on the *first* `scale(`/`rotate(` in the string, which can be the original transform's. |
> | Group / ungroup | `:378`, `:403`, `:91` `groupAsSymbol` | sibling selection → new `<g>` | Requires a common parent; preserves document order; inserts at the first selected index. `groupAsSymbol` wraps every non-`defs/title/desc/style/metadata` root child into `#symbol-content`. Ungroup does not fold the group's `transform`/`opacity` into children (visual change if the group had them). |
> | Z-order | `:452` `moveLayer` | swap with next/previous sibling | Within the same parent only. |
> | Visibility / lock / rename / delete | `:415–450`, `:264`, `:433` | | Hide = `display="none"`. Lock only blocks dragging. Delete-selected removes only top-most ancestors when parent+child are both selected. |
> | Add text placeholders | `:79` `addText`, service `createText` | role → `<text>` | Roles `label/value/unit/status/text` with SCADA defaults ("Pump Pressure", "75.5", "bar", "Normal"); centred in viewBox; size `max(12, vbWidth/18)`; appended to `#symbol-content` if present. |
> | Convert element type | `:213` `setElementType` | element ↔ `<text>` / `<rect>` placeholder | Uses `getBBox()` of the displayed clone. Lossy (path geometry is discarded). |
> | Gauge progress (dynamic state) | `:273` `applyGaugeProgress` | path/line/polyline + % + colour | `pathLength=100`, `stroke-dasharray="p 100-p"`, round caps, `data-gauge-progress`. This is the **only** dynamic/state colour mapping in the POC; there are no tag bindings or state-colour tables. |
> | Export | `:465` `exportFiles`, `:480` `buildDefinition` | DOM → `<name>.svg` + `<name>.json` | Strips editor UI and `data-editor-*`/`data-drag-*`, **keeps** `data-symbol-element/role/name/hidden/locked`. JSON = `SymbolDefinition` schema v1 (`composite-svg`, viewBox, flat `elements[]` with parentId, role, style props). `colorValue` normalizes hex/`rgb()` only (named colours, `rgba`, `url()` fall back). |
>
> **Not present in the POC** (though this brief asks for them): **undo/redo, pan/zoom, align, reset, keyboard shortcuts, symbol library, state-colour tables / tag bindings, unit tests.**
>
> **Design language.** Light-only, hard-coded palette (`#f4f6fa` bg, `#1d4ed8` primary, slate greys). Layout: top toolbar (brand + Import/Export) · left toolbox 205px (add-element buttons, Arrange buttons, tip box) · centre canvas with dashed 20px grid, heading and a status line · right sidebar 335px (Layers list with count badge; Properties with "Symbol" and "Selected object" sections). Layer rows: expand chevron, kind badge (▣/T/◇), name, tag, and visibility/lock/↑/↓/× icon buttons. Unicode glyphs as icons. Selected row: blue fill + outline + inset bar on the left. Empty states with icon + title + hint. Physical `left/right` CSS and `padding-left` indentation throughout (not RTL-safe). All text hard-coded English.

### 3.2 Platform.UI

> **FINDINGS: Platform.UI**
>
> - **Angular 21.2**, standalone components, signals, `bootstrapApplication` (`src/main.ts`), `provideRouter(routes, withComponentInputBinding())` (`src/app/app.config.ts:83`). Every route is lazy (`loadComponent` / `loadChildren`). Components use **inline templates and inline `styles`** (`.ts` only), `app-` prefix, `*-page.component.ts` naming, `protected` template members, `inject()`.
> - **Navigation.** There are no tabs. `ShellComponent` (`src/app/layout/shell.component.ts`) = top bar (brand, EN/AR switch, theme switch, auth) + **sidebar with labelled sections** (`shell.sections.i2p`) of `routerLink` items with an emoji icon, + `<router-outlet>` main area. Feature routes hang under the shell route (`src/app/app.routes.ts:27`, guarded by `authGuard`) and are lazy feature route files (`features/i2p/i2p.routes.ts`). **A new "tab" = a new sidebar section/link + a lazy `features/symbol-designer` route.** Route `title`s are hard-coded English strings (existing pattern).
> - **Theme.** `ThemeService` (`core/theme/theme.service.ts`) sets `data-theme` on `<html>` with **three** values: `light`, `dark`, `high-contrast`, persisted in localStorage. Tokens are CSS custom properties in `src/styles.css`: `--surface-ground/section/card/overlay/border/hover`, `--text-color(-secondary)`, `--text-muted`, `--primary-color(-text)`, `--primary-50…900` (light only), `--color-success/warning/danger/info`, `--focus-ring-*`. PrimeNG Aura is wired to the same attribute (`darkModeSelector: '[data-theme="dark"], [data-theme="high-contrast"]'`). Tailwind 4 is loaded but components use scoped CSS with tokens; `color-mix()` is used for tints (shell active link).
> - **UI kit / icons / fonts.** PrimeNG 21 (`p-table`, `p-tag`, `p-paginator` used so far). No icon font (`primeicons` not installed); icons are emoji/Unicode glyphs. System font stack; `[dir="rtl"]` switches to `"Segoe UI", Tahoma, Arial`.
> - **Shared states.** `shared/state/`: `app-empty-state`, `app-error-state` (with retry output), `app-loading-state`, `app-unauthorized-state`, `app-unavailable-state` — all take `heading`/`message` inputs. Note: `ErrorStateComponent` has a hard-coded English "Retry" label.
> - **i18n / RTL.** Transloco 7.6, one global JSON per language: `src/assets/i18n/en.json`, `ar.json`, nested keys (`shell.*`, `common.*`, `i2p.health.*`), `reRenderOnLangChange: true`, missing keys logged. `LocaleService` (`core/i18n/locale.service.ts`) sets `lang` + `dir` on `<html>` and exposes `isRtl()`. Shell CSS already uses logical properties (`border-inline-end`, `inset-inline-start`, `margin-block-end`). Numbers/dates are formatted with `en-GB` (`DisplayTimePipe`), so **Western (Latin) digits are the existing convention**, also in Arabic. No existing mirrored directional icons.
> - **State / API conventions.** Feature `data/` folder with typed API façade services over generated OpenAPI clients; pages own `signal`-based page state (`'loading' | 'loaded' | 'empty' | 'error' | 'unauthorized'`). No store library. The designer needs no backend.
> - **Executive Dashboard / Symbols.** Added in commit `ac614f7` under `public/` and therefore served at `/Executive Dashboard/Symbols/...` and **copied into `dist`**. **Nothing in `src/` references it yet.** Static hosting has no directory listing, so the library needs a manifest.
> - **Tests.** Vitest 4 through `@angular/build:unit-test` with jsdom (`npm run test:ci`). jsdom has **no SVG geometry** (`getBBox`, `getScreenCTM`, `createSVGPoint`), so geometry must be injected/faked in services. **Baseline: 15 of 40 existing tests fail** (`theme.service.spec.ts`, `locale.service.spec.ts`: `localStorage.clear is not a function`). This is environmental: the machine runs Node **25.2.1**, whose built-in `localStorage` shadows jsdom's; the README pins Node 24.13.x. Not caused by this work.
> - **Lint / format.** No ESLint. `npm run lint` = development build (type-check). Prettier (`.prettierrc`: printWidth 100, single quotes). `.editorconfig` present. **Production build passes** (baseline). Budget: `anyComponentStyle` warns at 8 kB, errors at 16 kB, so designer styles must be split across components.

### 3.3 Sample symbols

> **FINDINGS: symbols**
>
> 131 SVGs in 9 folders (+ `_preview.png`; a 20 MB `Symbols.zip` sits beside the folder). All are **Figma exports**: every file has `viewBox`, `width`, `height` and `fill="none"` on the root; ids follow `clip0_827_10592` / `paint0_linear_…` / `filter0_d_…`.
>
> | Folder | Files | Size | Character |
> |---|---|---|---|
> | `chart-parts` | 16 | 56 KB | 1–6 paths; capsules use `<use xlink:href>` + `<mask>` |
> | `charts` | 17 | 352 KB | gauges (96 paths each: tick marks + arc), radar, line/bar charts with gradients/filters |
> | `counters` | 6 | 148 KB | masks, drop-shadow filters, inline styles |
> | `icons` | 14 | 60 KB | 80/120 px; white strokes on transparent; `clip-path` groups |
> | `illustrations` | 47 | 12 MB | isometric art; up to 354 groups / 750 paths; gradients, filters, `mix-blend-mode` styles; some embed base64 PNGs |
> | `kpi-cards` | 15 | 192 KB | text **outlined to paths** |
> | `legends` | 9 | 76 KB | small pills, filters |
> | `photos` | 3 | 15 MB | a single base64 `<image>` each (~5 MB) |
> | `shapes` | 4 | 8 KB | one primitive each |
>
> **Awkward cases:**
> - **No `<text>` anywhere** (all text is outlined), so text editing only applies to placeholders the user adds.
> - **51 files have no ids at all**, so a deterministic id strategy is required.
> - **46 use `clip-path`/`mask`, 29 gradients, 18 filters, 11 `<use>`.** All references are internal `url(#…)`; the POC sanitizer keeps them.
> - **22 files have inline `style=`** (mostly `mix-blend-mode`), which presentation-attribute edits cannot override.
> - **28 files have `transform`s.**
> - **8 files embed `data:image` rasters**, and **5 exceed the POC's 5 MB limit** (3 photos at 5.03 MB, 2 clocks at 4.4 MB are borderline).
> - **Many icons are white-on-transparent**, designed for a dark dashboard, so they are invisible on a white canvas. This argues for a canvas backdrop control.
> - No scripts, event handlers, `foreignObject` or external hrefs.
> - No samples are missing a viewBox, use units, use `<style>`, or contain empty groups. Those edge cases need synthetic fixtures.
>
> **Representative test set:**
>
> | # | File | Why |
> |---|---|---|
> | 1 | `icons/tile-bed.svg` | Simple: rect + `clip-path` group + strokes, white-on-transparent |
> | 2 | `chart-parts/capsule-filled-red.svg` | `<use xlink:href>` + `<mask>` in `defs` |
> | 3 | `chart-parts/gauge-arc-cyan-empty.svg` | 2-path arc, the target for gauge progress |
> | 4 | `counters/counter-card-admission.svg` | Nested groups with masks, filters and inline styles |
> | 5 | `illustrations/iso-operating-table-glow.svg` | Complex: 25 groups, 21 filters, 13 transforms, gradients |
>
> **Stress set (Phase 5):** `illustrations/iso-virus.svg` (354 g / 750 paths), `illustrations/iso-waiting-area.svg` (773 paths), `photos/photo-body-scan-full.svg` (5 MB raster).

### 3.4 Mapping table

| Standalone feature or algorithm | Platform.UI target | Action | Notes |
|---|---|---|---|
| `parseAndSanitize` + file checks | `services/svg-import.service.ts` | Adapt | Keep POC rules. Add: strip DOCTYPE/PIs, `<style>` with `@import`/external `url()`, `<animate>/<set>` targeting `href`/`on*`. Limit raised to 10 MB (D7). viewBox from width/height with unit stripping. Returns a typed result or a typed error code (translated in the UI). |
| `decorateSelectableElements` | `services/symbol-breakdown.service.ts` + `utils/part-ids.ts` | **Rewrite** | Deterministic ids from the structural path (`p-0-3-1`) instead of `randomUUID`. Editor metadata kept in the model, **not** written onto the DOM. Skip `defs/clipPath/mask/pattern/symbol/marker/linearGradient/radialGradient/filter` subtrees. Add `<use>` as a part. |
| `rebuildLayers` | `symbol-breakdown.service.ts` → `SymbolPart` tree | Adapt | Same paint-order reversal and transparent non-part groups. Returns an immutable tree. Expansion state lives in the UI store. |
| Click / ctrl-click selection, `hasLockedAncestor` | `utils/selection.ts` + store | Reuse | Same rules (deepest part, Ctrl/Cmd toggle, primary = first). Part lookup via `Map<id, Element>` (O(1)) instead of a scan. |
| Selection highlight (injected `<style>` drop-shadow) | `symbol-canvas` overlay layer | **Rewrite** | Separate overlay SVG drawn from bbox, token-coloured. Never injected into the symbol (rule 3c). |
| Drag move | `commands/move-parts.command.ts` + canvas pointer handling | Adapt | Same x/y-vs-translate rule; one coalesced history entry per drag. |
| `applyAppearance` / `updateSelected` (+ apply to group children) | `commands/set-style.command.ts` | Adapt | Same attributes and clamps. Records old values for undo. Warns when an inline `style` overrides the attribute. |
| `applyTransformProperties` + regex readback | `utils/transform.ts` + `commands/set-transform.command.ts` | **Rewrite** | Same controls (scale X/Y, rotation, offset). Rotate/scale about the part's bbox centre. Editor transform params held in the model, not re-parsed from the string. |
| Group / ungroup / group-all | `commands/group.command.ts`, `ungroup.command.ts` | Reuse | Same sibling rule and insertion index. `#symbol-content` id kept for compatibility. |
| Visibility / lock / rename / delete / z-order | `commands/*.command.ts` | Reuse | Same semantics; all undoable. |
| `addText(role)` / `createText` | `commands/add-text.command.ts` | Reuse | Same roles and defaults; default strings translated in the UI. Default fill uses the POC value (symbol content, not UI). |
| `setElementType` (convert to text/rect) | `commands/convert-element.command.ts` | Adapt or **defer** | Lossy and bbox-dependent. Proposed as v1 deferral (Q3). |
| Gauge progress | `commands/gauge-progress.command.ts` | Reuse | Only dynamic-state feature in the POC. |
| `exportFiles` / `serialize` / `buildDefinition` | `services/symbol-export.service.ts` | Adapt | Same `SymbolDefinition` schema v1 (compatible with POC output). Writes `data-name/role/hidden/locked` and deterministic ids at export. Pure string/Blob output; the download helper lives in `utils/file.ts`. |
| `colorValue`, `safeFileName`, `number`, `toSvgPoint` | `utils/color.ts`, `utils/file.ts`, `utils/geometry.ts` | Reuse | `colorValue` extended to `rgba`, 3-digit hex and named colours. |
| `message` status line | toolbar status region (`aria-live="polite"`) | Adapt | Translated keys with params. |
| *(none)* undo/redo | `services/symbol-history.service.ts` | **New** | Command stack (inverse ops, not full-document snapshots, because files reach 5 MB). Cap of 100 entries. Coalesces drags and typing. |
| *(none)* pan/zoom/reset | `symbol-canvas` + `utils/viewport.ts` | **New** | CSS transform on a wrapper, so the symbol's own viewBox is never touched. |
| *(none)* library | `symbol-library-panel` + generated manifest | **New** | See D4. |
| 3-column layout, hard-coded light CSS | I2P page layout, tokens, logical properties | **Rewrite** (styling) | Keep the information architecture: library/tools · canvas · parts tree + properties. |

### 3.5 Proposed architecture

```
src/app/features/symbol-designer/
├─ symbol-designer.routes.ts                 # SYMBOL_DESIGNER_ROUTES (lazy, under shell)
├─ symbol-designer-page.component.ts         # page shell: header + 3-region grid (I2P layout)
├─ state/
│  └─ symbol-designer.store.ts               # signals store, provided by the page component
├─ components/
│  ├─ designer-toolbar/                      # import, export, undo/redo, zoom, reset, backdrop
│  ├─ symbol-library-panel/                  # sample symbols (manifest) + imported files
│  ├─ symbol-canvas/                         # renders the doc, pan/zoom, hover/selection overlay
│  ├─ parts-tree-panel/                      # tree, expand/collapse, visibility/lock/z-order
│  └─ properties-panel/                      # name/role, text, appearance, transform, gauge
├─ services/
│  ├─ svg-import.service.ts                  # parse + sanitize → SymbolDocument | ImportError
│  ├─ symbol-breakdown.service.ts            # doc → SymbolPart tree (deterministic ids)
│  ├─ symbol-edit.service.ts                 # builds commands from UI intents
│  ├─ symbol-history.service.ts              # undo/redo stack, coalescing
│  └─ symbol-export.service.ts               # SVG string + SymbolDefinition JSON
├─ commands/                                 # SymbolCommand implementations (do/undo)
├─ models/
│  ├─ symbol.model.ts                        # SymbolDocument, SymbolDefinition (schema v1)
│  ├─ symbol-part.model.ts                   # SymbolPart, SymbolElementRole, PartKind
│  └─ symbol-command.model.ts                # SymbolCommand interface, command payload types
└─ utils/                                    # pure: part-ids, transform, color, geometry, viewport, file
src/assets/symbol-designer/library.json      # generated manifest of the sample symbols
scripts/build-symbol-library.mjs             # `npm run symbols:manifest`
```

**Component tree:** `SymbolDesignerPageComponent` → `DesignerToolbar`, `SymbolLibraryPanel`, `SymbolCanvas`, `PartsTreePanel`, `PropertiesPanel`. Children read and write only through the store.

**Data flow:** file or library URL → `SvgImportService.parse()` (sanitized detached `SVGSVGElement`) → `SymbolBreakdownService.build()` (`SymbolPart` tree + `Map<partId, Element>`) → store signals (`document`, `parts`, `selection`, `revision`). A UI intent → `SymbolEditService` creates a `SymbolCommand` → `SymbolHistoryService.execute()` mutates the doc and bumps `revision` → breakdown is recomputed and the canvas re-renders. `SymbolExportService.export(doc, parts)` → `{ svg, definition }` → download.

**Rendering:** the editable document itself is mounted into the canvas host (no clone per change, unlike the POC). Selection and hover are drawn in a sibling overlay SVG. The host sets `direction: ltr` and is excluded from theme-driven colours, so the symbol is never mirrored or re-themed (rule 3c). Library thumbnails use `<img src>`, which avoids id collisions between inline SVGs and needs no sanitizing.

**Route and tab:** the shell gets a new sidebar section `shell.sections.design` ("Design tools" / "أدوات التصميم") with a link to `/symbol-designer` (icon ✏️, matching the emoji convention). `app.routes.ts` gets one child: `{ path: 'symbol-designer', loadChildren: () => import('./features/symbol-designer/symbol-designer.routes') }`. The whole feature is one lazy chunk.

**Lifetime:** the store is provided at the page level, so switching language or theme does not destroy the page, and the open symbol, selection and history survive. Navigating away discards the session (D10).

**CHECKPOINT 1: stop and report.**

> **CHECKPOINT 1 result:** reported on 2026-11-23. The user replied "proceed with the md file as I posted", so the open questions were resolved with the defaults that follow the brief literally (D15–D18).
>
> **As built** (differences from the tree above): `components/designer-icon/` (inline SVG icons), `services/symbol-library.service.ts` (manifest + fetch), `testing/` (spec-only helpers that read the original sample files read-only). The page file is `symbol-designer-page.component.ts`, following the I2P `*-page.component.ts` naming. Edit "commands" are plain data (`models/symbol-command.model.ts`: attr/text/meta/node ops) built by functions in `symbol-edit.service.ts`, so there is no `commands/` folder.

---

## 4. Phase 2: Foundation

1. Create the feature folder and register the **Symbol Designer** tab in the existing navigation, following I2P's tab pattern and route conventions (lazy-loaded if the app does that elsewhere).
2. Define the models (`Symbol`, `SymbolPart`, edit command types) with strict typing.
3. Build the tab shell using I2P layout components and theme tokens only. No hard-coded colors; map the standalone's color concepts onto I2P tokens for **both dark and light**.
4. Add the translation keys for the tab (tab title, panel titles, toolbar actions) in `en` and `ar`, and use logical CSS properties from the start so RTL works without rework.
5. Verify that the tab loads, matches the I2P shell, and shows no console errors, in all four combinations: light/EN, light/AR, dark/EN, dark/AR.

**CHECKPOINT 2:** app builds and the empty tab renders correctly in the I2P theme in all four combinations.

> **CHECKPOINT 2 result:**
> - Sidebar section `shell.sections.design` with a "Symbol Designer" link → `/symbol-designer`, a lazy `loadChildren` under the guarded shell (`app.routes.ts`, `layout/shell.component.ts`).
> - Models in `models/`, strict typing, no `any`.
> - The page uses only I2P tokens. Light/dark/high-contrast switch through the existing `data-theme` attribute.
> - 153 `symbolDesigner.*` keys plus `shell.sections.design` in both `en.json` and `ar.json`. Logical CSS properties throughout.
> - **Automated:** development and production builds pass with no budget warnings; the feature is one lazy chunk (84 kB raw / 21 kB gzip). `symbol-designer-page.component.spec.ts` renders the page in EN and AR with no raw keys.
> - **Pending manual check:** visual pass in light/EN, light/AR, dark/EN and dark/AR.

---

## 5. Phase 3: Algorithms (services, test-first)

Port the algorithms from section 3.1 into the services listed above.

- Each service is a pure, typed class or function set with no direct DOM dependence beyond `DOMParser`/SVG DOM APIs.
- Sanitize imported SVG (strip scripts, event handlers, external refs).
- Break-down output must be deterministic. Part ids stay stable between runs.
- Edit operations are expressed as commands so history can undo and redo them.
- Write unit tests for each service, using the representative symbols from 3.3 as fixtures. Cover edge cases: no viewBox, nested groups, transforms, inline styles, empty groups.

**CHECKPOINT 3:** tests pass. Round trip works: import → break down → no-op edit → export gives an SVG visually equivalent to the input.

> **CHECKPOINT 3 result: passed.**
> - Spec files: `svg-import`, `symbol-breakdown`, `symbol-history`, `symbol-edit`, `symbol-export` and `utils`.
> - Fixtures are the 5 representative samples, read from the original files (read-only), plus synthetic edge cases: no viewBox (with units), nested and empty groups, transforms, inline styles, duplicate ids, POC metadata attributes.
> - Every command is checked for apply → undo (identical DOM) → redo (identical DOM).
> - The round trip compares a structural fingerprint (tags, attributes, text). It ignores only the metadata attributes and ids that the exporter adds.
> - Bug found and fixed along the way: a part with no original transform re-captured the editor translate as its "base" on the second move.

> **Implementation notes:**
> - Commands are built by an `OpRecorder` that applies each op live, records it, then reverts. Recorded insert positions are therefore always replayable; deleting siblings in any order undoes correctly.
> - Undo is inverse ops with a cap of 100. Commands with the same key within 1.5 s merge into one step (a drag, typing a name, dragging a colour picker).

---

## 6. Phase 4: UI

Build the panels from the architecture, using the standalone's structure and interaction concepts with I2P styling.

- **Library panel:** list the sample symbols from the `Symbols` folder and allow importing a new SVG from disk.
- **Canvas:** render the symbol, with pan and zoom, part hover and selection, and selection feedback.
- **Parts tree:** the broken-down structure. Selecting a node selects the part on the canvas, and the reverse.
- **Properties panel:** edit fills, strokes, opacity, transforms and any dynamic-state color mapping the standalone supports.
- **Toolbar:** import, export, undo, redo, zoom, reset.
- Empty, loading and error states in I2P style. Keyboard shortcuts where the standalone had them.
- Accessibility basics: focus order, labels, and contrast **in both dark and light modes**.
- **RTL behavior:** the side panels swap sides, the toolbar order mirrors, and directional icons flip. Technical values (coordinates, hex colors, ids, units) stay LTR and use the same numeral style as the rest of I2P. Part names from imported SVGs may be English or Arabic, so render them with `dir="auto"`.
- Switching language or mode at runtime updates the tab immediately, without losing the open symbol, selection or undo history.

**CHECKPOINT 4:** with the sample symbols, the user can import, select parts, edit colors and transforms, undo and redo, and export, in both languages and both modes.

> **CHECKPOINT 4 result: built. Automated checks pass; the manual check is pending.**
> - **Library:** manifest-driven, with search, collapsible categories, lazy `<img>` thumbnails on a mid-tone backdrop, and an "Imported" section for files from disk.
> - **Canvas:** the live document is mounted with no clone per change. Wheel zoom around the cursor; drag the background (or middle mouse) to pan.
> - **Selection and editing:** hover and selection outlines are drawn in a separate overlay. Click, Ctrl/Cmd+click and drag-to-move follow the POC rules; locked parts don't drag.
> - **Parts tree:** expand/collapse, visibility, lock, z-order, delete, ARIA `tree`, arrow-key navigation (reversed in RTL), and auto-reveal of parts selected on the canvas.
> - **Properties:** every POC control (name, role, text, font, fill/stroke/width/opacity, scale/rotation plus offsets, gauge progress).
> - **Toolbar:** import, export, undo/redo, the add-element and arrange actions moved from the POC toolbox, zoom in/out/reset and the backdrop picker. States reuse I2P's `app-empty-state`, `app-loading-state` and `app-error-state`.
> - **RTL:** the grid and toolbar mirror automatically. Undo, redo and the tree chevron flip. Ids, coordinates and hex values are LTR; part names use `dir="auto"`.
> - **Language/theme switch:** the page spec switches EN→AR mid-session and asserts that the symbol, selection and undo history survive.
> - **Pending manual check:** pointer interactions and the visual result in a real browser (jsdom has no SVG geometry).

---

## 7. Phase 5: Hardening

- Test all sample symbols in the folder, not just the representative set. Log failures and fix the parser or breakdown where reasonable.
- Performance check on the most complex symbol (no visible lag on selection and edit).
- Visual pass over every panel and state (empty, loading, error, selected, disabled) in all four combinations: light/EN, light/AR, dark/EN, dark/AR. Look for clipped Arabic text, untranslated strings, unmirrored icons, low contrast and hard-coded colors.
- Check that no translation key is missing in either `en` or `ar`.
- Run lint, format, unit tests and a production build. All must pass.
- Remove dead code and debug logging.

> **Phase 5 result:**
> - **All 131 samples:** each imports, breaks down with unique ids, exports to a structurally identical SVG, and re-imports with the same ids (`symbol-designer.hardening.spec.ts`). **No failures.** The 5 MB photos import under the 10 MB limit (D7).
> - **Performance:** a full breakdown of `iso-virus.svg` (1,100+ parts) is asserted under 150 ms per run in jsdom. Measure in a real browser too.
> - **Translations:** a spec checks that `en`/`ar` key sets are identical and that every static `symbolDesigner.*`/`shell.*` key used in the feature exists.
> - **Hard-coded colours:** none in the feature's CSS or templates. The only literals are symbol-content defaults ported from the POC (new text fill `#1f2937`, gauge colour `#16a34a`, stroke `#000000`). Those are symbol data, not UI.
> - **Format:** Prettier passes on all new files. Pre-existing files touched here (`app.routes.ts`, `shell.component.ts`) were not Prettier-clean before, so they were not reformatted (rule 5).
> - **Tests:** the full suite is 237 passed, 15 failed. The 15 are exactly the pre-existing Node 25 `localStorage` failures (D14); all 212 designer tests pass.
> - **Production build:** passes. **Lint** (`npm run lint` = development build) passes.
> - **Pending manual check:** the visual pass over every state in the four combinations (clipped Arabic text, contrast).

---

## 8. Definition of done

- [x] Sections 3.1 to 3.5 are filled in and accurate to the real code
- [x] Symbol Designer tab is registered and follows I2P's navigation flow
- [x] UI uses I2P theme tokens, with no stray hard-coded colors
- [ ] Works in dark and light mode, with the toggle applying live. *(Token-based, so it switches live by construction. Needs a visual check.)*
- [ ] All UI text is translated in `en` and `ar`, and the layout mirrors correctly in RTL. *(Translations verified by spec. Mirroring needs a visual check.)*
- [x] The edited symbol and its exported SVG are unaffected by language or mode. *(The export never reads UI state; the canvas host resets direction, colour and font.)*
- [x] Sample SVGs import, break down, edit and export correctly (all 131, automated)
- [x] Core algorithm services have unit tests that pass (212 tests)
- [ ] Lint, tests and production build pass. *(Lint and build pass; designer tests pass. 15 pre-existing failures remain under Node 25; see D14.)*
- [x] Original SVG assets and the standalone POC are unmodified
- [x] Section 9 lists decisions, deferrals and assumptions

---

## 9. Decision and progress log

| # | Date | Decision, deviation or assumption | Reason |
|---|---|---|---|
| D1 | 2026-11-23 | "Tab" = new **sidebar section + nav link** (`/symbol-designer`), not a tab strip. | Platform.UI has no tabs; the shell's sidebar sections are the I2P navigation pattern. |
| D2 | 2026-11-23 | Support all **three** I2P themes (light, dark, high-contrast), not just two. | `ThemeService` ships high-contrast; tokens make it nearly free. |
| D3 | 2026-11-23 | Feature-local signals store provided by the page; no store library. | Matches existing pages; keeps state alive across lang/theme switches. |
| D4 | 2026-11-23 | Library listing comes from a **generated manifest** (`src/assets/symbol-designer/library.json`, `npm run symbols:manifest`), committed. Nothing is written into the Symbols folder. | Static hosting has no directory listing; the originals must stay untouched. |
| D5 | 2026-11-23 | Deterministic part ids from the structural index path, assigned at import. Commands use per-session counters. Original `id`s are kept. | Brief requires stable ids; the POC used `randomUUID`. |
| D6 | 2026-11-23 | Editor state (selection, lock, expand, transform params) lives in the model, **not** in `data-*` attributes on the symbol. Export writes only POC-compatible `data-name/role/hidden/locked`. | Rule 3c; simpler, lossless export. |
| D7 | 2026-11-23 | Import limit raised from 5 MB to **10 MB**. | 3 sample photos are 5.03 MB. |
| D8 | 2026-11-23 | Undo/redo with inverse-op commands (not document snapshots); cap of 100; drags and typing coalesced. | Brief requires it; samples reach 5 MB, so snapshots are too costly. |
| D9 | 2026-11-23 | Rotation and scale pivot on the part's bbox centre (POC used origin 0,0). | The POC behaviour is a visible defect; the control set is unchanged. |
| D10 | 2026-11-23 | No persistence across navigation in v1 (session is in-memory). | Not in the POC; no backend endpoint exists. |
| D11 | 2026-11-23 | Icons: inline SVG / Unicode in the existing emoji style, directional ones flipped with `[dir=rtl]`. No icon dependency. | Rule 4; no icon library in the app. |
| D12 | 2026-11-23 | Technical values (coords, hex, ids) use Latin digits and `dir="ltr"`; part names use `dir="auto"`. | `DisplayTimePipe` uses `en-GB`, so Latin digits are the existing convention. |
| D13 | 2026-11-23 | Route `title` follows the existing hard-coded English pattern. | Existing convention; a translated `TitleStrategy` would touch unrelated code. Listed as a follow-up. |
| D14 | 2026-11-23 | Baseline: 15 existing tests fail under Node 25 (`localStorage.clear`). Not fixed here. New specs avoid `localStorage`. | Environmental and pre-existing; rule 5. |

| D15 | 2026-11-23 | Checkpoint 1 Q1 (default): build only the new features the brief names (undo/redo, pan/zoom, reset). Align/distribute and state-colour tables are deferred. | Rule 2: port, don't invent; the POC has neither. |
| D16 | 2026-11-23 | Q4 (default): minimal standard shortcuts: Ctrl/Cmd+Z undo, Ctrl/Cmd+Y or Shift+Z redo, Delete/Backspace delete, Esc clear selection. Ignored while typing in a field. | The POC had none, but the brief requires undo/redo and these are the universal bindings. Easy to remove. |
| D17 | 2026-11-23 | Q4 (default): canvas backdrop picker with **theme / inverse / checker** options, all token-based. | Many samples are white-on-transparent and invisible on a light canvas; rule 3c allows the backdrop to follow the theme. |
| D18 | 2026-11-23 | Q3 (default): POC "convert element type" (`setElementType`) deferred. | Lossy (discards path geometry). |
| D19 | 2026-11-23 | Colour/style edits also remove the same property from inline `style=""`. | Otherwise edits on the 22 samples with inline styles would have no visible effect. |
| D20 | 2026-11-23 | Ungroup folds the group's `transform`, inherited presentation attributes and opacity (multiplied, approximate where children overlap) into the children. Groups with `clip-path`/`mask`/`filter` cannot be ungrouped; a warning is shown. | The POC dropped them silently and changed the artwork. |
| D21 | 2026-11-23 | Properties apply to the primary (first) selection; a hint is shown when several parts are selected. | POC behaviour. |
| D22 | 2026-11-23 | Default text for new placeholders and default group names are translated (an Arabic user gets Arabic placeholder text). | They are user-facing defaults; the symbol content itself is still never altered by a later language switch. |
| D23 | 2026-11-23 | Feature components use `ViewEncapsulation.None` with `sd-` prefixed classes; shared control styles live on the page under `.sd`. | The mounted symbol needs unscoped rules, and it keeps every component under the 8 kB style budget. |
| D24 | 2026-11-23 | Specs read the original sample SVGs with `node:fs` (read-only). Minimal typings live in `testing/node-fs.d.ts` because `@types/node` is not installed. | Rule 4 (no new dependency); avoids duplicating fixtures. |
| D25 | 2026-11-23 | Switching to another symbol with unsaved edits asks for confirmation (`window.confirm`, translated). | Prevents silent data loss; the session is in-memory only (D10). |
| D26 | 2026-11-23 | Renaming keeps the raw value while typing; the exporter trims. | Trimming live removed spaces from the input. |

**Deferred / out of scope for v1:**
- Align/distribute, state-colour tables and tag bindings (not in the POC; D15).
- Element-type conversion (D18).
- Persistence of designed symbols / backend endpoint (D10), and server-side sanitization for multi-user use.
- Translated document titles (D13).
- Unsaved-changes guard on route navigation (only symbol switching is guarded).
- Virtual scrolling in the parts tree; check whether it's needed after the browser performance test.

**Suggested next steps:**
- **Manual verification** (the user): run `npm start`, open **Design tools → Symbol Designer**, and walk through the checks below in light/EN, light/AR, dark/EN and dark/AR (plus high-contrast).
  - Open `icons/tile-bed.svg` (try the inverse backdrop).
  - Open `counters/counter-card-admission.svg`.
  - Open `illustrations/iso-virus.svg` (performance).
  - Select, drag, recolour, rotate, group/ungroup, undo/redo, then export, and check the exported SVG in a browser.
- Fix the 15 pre-existing test failures by running on Node 24.13 (the README pin) or by mocking `localStorage` in those specs.
- Consider excluding `Symbols.zip` (20 MB) and `_preview.png` from `public/`, since both ship in `dist`. Outside the scope of this work.
- Re-run `npm run symbols:manifest` whenever the Symbols folder changes.
