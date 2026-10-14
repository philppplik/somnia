# Photos before/after split view (P36)

Third functional photo-studio feature phase. The Photos workspace can now
show the untouched original and the developed preview at once: the
original overlays the preview and is erased right of a draggable
divider. Hold-to-compare stays as the quick variant.

## What changed

- `src/lib/photos/splitView.ts`: pure helpers — `clampSplitX` keeps the
  divider inside the frame with a visible margin (2%), `splitClearRect`
  computes the pixel region of the original overlay to erase right of the
  divider.
- `PhotosWorkspace`: a compact icon toggle (`Columns2`) in the bar next
  to compare and clipping, persisted via `panelStateStore` under
  `photos.split` (default off). When on, a second canvas paints
  `session.original` over the preview (`pointer-events-none`, same
  pixelated-rendering rule at high zoom) and a `clearRect` opens the
  developed frame right of the divider; repaint tracks original changes
  and every divider move. The divider is an SVG line pair (2 px visible
  line, 14 px transparent drag handle with `cursor-col-resize`), so no
  new inline styles and the inline-style ratchet stays flat. The drag
  reuses the crop overlay's `pointerPos` geometry, so the divider follows
  zoom and pan exactly. Toggle is disabled until a session original
  exists.
- i18n: `photos.split` added to all five photo locales
  (en, de, es, fr, pt-BR).

## Coverage

- Unit: `src/lib/photos/splitView.test.ts` (4 tests: clamping incl. NaN,
  erase region right of the divider, edge margins keep both sides
  visible, whole-pixel rounding). All existing photos tests unmodified
  and passing (90 tests including P34/P35 additions).
- Browser: `test/design-system/photos-split.spec.ts` drives the real
  `PhotosWorkspace` on a stubbed-engine session whose engine renders the
  neutral settings as a cool frame and edited settings as a warm frame,
  via the `?view=photos-split` gallery route: overlay renders, divider
  drag moves the split left, toggle removes it; light/dark
  production-style screenshots with the divider at one third
  (`test-results/ds-photos-split-{light,dark}.png`).
- Pixel parity: stage captures with the split toggled off
  (`ds-photos-split-stage-{light,dark}.png`) are pixel-identical to a
  base-tree run (`ddecbd06` + proof/route/spec only) in both themes, so
  the only visual change is the split overlay itself and the bar toggle.
- No new raw controls (the toggle is the DS `Button`); ratchets
  unchanged. Actual app photos E2E remains CI-only.

## Split direction (P70)

The split view now works horizontally too: a `Rows2` toggle
(`photos.split.dir`, default vertical) next to the split toggle flips the
divider between a vertical line (erase right of it) and a horizontal one
(erase below it).

- `src/lib/photos/splitView.ts`: `SplitDirection` type and a
  `splitClearRect(..., direction = 'vertical')` parameter — horizontal
  returns the rect below the divider; the default keeps the original
  behavior, so every existing caller and test is untouched.
- `PhotosWorkspace`: direction persisted in `panelStateStore` under
  `photos.splitDir`; the divider SVG exposes `data-direction`, renders a
  horizontal line pair with `cursor-row-resize`, and the drag reads
  `pointerPos`'s `y` instead of `x`. The erase rect is passed the
  current direction on every repaint.
- i18n: `photos.split.dir` in all five photo locales.

Coverage: `splitView.test.ts` gains a horizontal-rect case (below the
divider, edge margins clamped); `photos-split.spec.ts` gains a
light/dark leg that toggles direction, asserts `data-direction`, grabs
the handle where it sits, and drags it downward on the y axis.
