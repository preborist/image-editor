# PrintEdit

A browser-based, **non-destructive** image editor aimed at the printing workflow. Load an image, crop it (with print-ratio presets), mirror and rotate it, tune brightness/contrast/saturation, apply grayscale/sepia filters, undo/redo freely, and export the result at full original resolution — plus a JSON recipe that reproduces the exact edit. Dark and light themes, and a mobile-friendly layout.

## Quick start

```sh
npm install
npm run dev
```

Then open the printed local URL. Build a production bundle with `npm run build`, and type-check with `npm run type-check`.

## How it works

Editor state is just an **immutable original** plus an ordered list of serializable operations:

```ts
state = { original: ImageBitmap, ops: EditOperation[] }
```

The displayed (and exported) image is a **pure function** `render(original, ops, scale)`. Nothing is ever drawn back onto the original, so deleting every operation restores the source bit-for-bit.

`EditOperation` is a discriminated union:

```ts
{ id, type: 'transform', params: { rotate90: 0|1|2|3, fineAngle, mirrorH, mirrorV } }
{ id, type: 'crop',      params: { x, y, width, height } }           // transformed-image pixels
{ id, type: 'adjust',    params: { brightness, contrast, saturation } } // -100..100, 0 = identity
{ id, type: 'filter',    params: { name: 'grayscale' | 'sepia', amount } } // 0..1
```

Ops apply in the canonical order **`transform → crop → adjust → filter`**. Crop coordinates live in the *transformed* image's pixels, so cropping the previewed (already oriented) image is 1:1. When the transform changes, the store **remaps the crop rectangle** (`remapCrop`) through original-image space so it keeps covering the same content — this way flipping/rotating an already-cropped photo transforms that crop, *and* cropping an already-transformed photo crops what you see.

### JSON export shape

```jsonc
{
  "version": 1,
  "source": { "name": "photo.jpg", "width": 4000, "height": 3000 },
  "ops": [ /* EditOperation[] in apply order */ ]
}
```

Replaying `ops` in order on the same original reproduces the exported image.

## Project structure

```
src/
  styles/                     # pure-SCSS design system (tokens, mixins, functions)
  plugins/vuetify.ts          # Vuetify theme derived from the SCSS tokens
  features/editor/
    types/                    # EditOperation union, OpsDocument, assertNever
    store/editor.ts           # Pinia store: original + ops, upsert/transform, undo/redo
    composables/
      useImageLoader.ts       # validate + decode to immutable ImageBitmap
      renderPipeline.ts       # pure render() + transform/filter geometry
      useRenderPipeline.ts    # rAF-throttled preview scheduling
      useCropSession.ts       # shared crop state (ratio presets, W/H units)
      useExport.ts            # full-res image export (+ JPEG matte) + JSON export
      useAppTheme.ts          # dark/light theme: Vuetify + --pe-* vars, persisted
      useEditorShortcuts.ts   # global undo/redo keyboard shortcuts
    components/                # UploadPanel, EditorCanvas, CropOverlay, TransformControls…
```

## Key decisions & trade-offs

**Single canvas pipeline for preview *and* export.** `render(source, ops, scale)` is the only place pixels are produced. The preview calls it at a fit-to-viewport scale; export calls it at `scale = 1` (full resolution). One code path makes "what you see is what you export" structurally guaranteed instead of a thing that drifts between two implementations. The only difference between preview and export is the output resolution.

**`ctx.filter` string instead of per-pixel loops.** Adjustments and filters compose into a CSS filter string (`brightness() contrast() saturate() grayscale() sepia()`) set on the 2D context before a single `drawImage`. This is GPU-accelerated, keeps sliders smooth even at full resolution, and stays tiny in code. The trade-off is a dependency on `ctx.filter` (well supported in modern evergreen browsers) and a fixed set of filter primitives — exotic effects would need per-pixel access, which is out of scope. The normalized-unit → filter-string mapping lives in exactly one place (`renderPipeline.ts`).

**Crop stored in source pixels, not view pixels.** The crop is a custom on-canvas overlay (draggable box + 8 handles) rendered directly over the preview. The selection is kept in normalized (0–1) coordinates so it survives window resizing, then converted to original source pixels on apply. It is applied via the `drawImage` source rectangle rather than being baked into the original, so it replays independently of the preview scale.

**Versioned JSON schema.** The document carries `version: 1` and `source` metadata so recipes remain forward-compatible and self-describing. Replay is defined against the full-resolution original, which is why reproducibility holds regardless of the resolution any given preview was rendered at.

**One SCSS source of truth shared with Vuetify.** Design tokens live in `src/styles/_variables.scss`. They feed Vuetify two ways: the JS theme reads them through an ICSS `:export` bridge (`tokens.module.scss`), and Vuetify's own SASS is compiled with matching variable overrides via `vite-plugin-vuetify`. Components use scoped SCSS with `@use`, BEM-ish class names, and no utility classes or inline styles.

**rAF-throttled preview.** Slider bursts are coalesced to at most one render per animation frame; because the queued frame reads live state when it fires, the final settled value is always the one rendered.

**Transforms without clipping.** Mirror + rotation are one consolidated `transform` op. `render()` first orients the source into an intermediate canvas sized to the rotated image's axis-aligned bounding box (center-based `scale`/`rotate`), so nothing is clipped and corners stay transparent, then crops that oriented canvas. The same math runs at any scale, so preview still equals export. JPEG export composites over a white matte (it has no alpha); PNG keeps transparency. Fine rotation ("straighten") is limited to ±45° in 1° steps.

**Crop ↔ transform stay consistent.** Crop is stored in the transformed image's pixels, so cropping the previewed (already oriented) image is 1:1 — you crop what you see. To also make "flip/rotate an already-cropped image" transform *that crop*, the store remaps the crop rectangle whenever the transform changes (`remapCrop`), treating a flip or 90° rotation as a **frame flip/rotate in box space**: the crop's dimensions are preserved exactly and it keeps tracking the same content, even with a non-zero straighten angle and across repeated flips/rotations. Straighten (fine-angle) changes don't remap the crop — the frame stays put while the image rotates under it.

**Undo/redo via op-stack snapshots.** The store keeps `past`/`future` arrays of whole op-stack snapshots. Discrete actions snapshot themselves; continuous slider drags snapshot once at interaction start (`@start`) so a drag is a single history entry. Snapshotting the tiny op array avoids per-op inverse logic entirely. Reset and loading a new image clear history. Shortcuts: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y.

**Dark + light theme from one token source.** Theme-varying colors are CSS custom properties (`--pe-*`) defined per theme in `main.scss`; component SCSS aliases them, so every custom component switches automatically. Vuetify components switch via two Vuetify themes built from the same tokens (ICSS bridge). `useAppTheme` keeps the Vuetify theme and the `<html data-theme>` attribute in sync, defaults to the OS `prefers-color-scheme`, and persists the choice in `localStorage`.

**Responsive layout.** On desktop the controls sit in a fixed right column. Below Vuetify's `md` breakpoint the sidebar becomes a bottom sheet with a tap-to-expand handle so the canvas gets priority and touch targets stay comfortable; crop mode swaps the sheet contents. Dynamic viewport units (`dvh`) handle mobile browser chrome.

## Out of scope

Importing an ops JSON to re-apply, perspective/skew transforms, and a visual op-reordering UI are intentionally left out (possible future work — the op model already accommodates additive ops).
