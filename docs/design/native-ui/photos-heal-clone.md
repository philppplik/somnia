# Photos heal / clone stamp (P44)

Ninth functional photo-studio feature phase. The workspace gains a
clone-stamp mode: drag from the spot you want to remove toward a clean
source area, and the stroke is stamped into the photo — the classic
healing/clone workflow for sensor dust, blemishes and small
distractions.

## What changed

- `src/lib/photos/healSpots.ts`: the spot model and the pixel
  operation. A `HealSpot` is a normalized target point (`x`, `y`), a
  radius as a fraction of the shorter side, and a normalized offset
  (`dx`, `dy`) to the source. `applySpots` copies a soft-edged disc
  (smoothstep falloff, fully opaque up to 70% of the radius) from each
  source position onto its target, spot by spot in order, and returns
  the input frame untouched when the list is empty. `clampSpot`,
  `validSpot` and `spotSignature` keep settings sane and comparable.
- `studioSettings.ts`: `PhotoSettings.spots` joins the schema with
  neutral `[]`. Sanitize accepts the key, defaults old payloads without
  it to `[]`, validates every spot (type + finite ranges) and caps the
  list at 200 entries. `photoSignature` covers the spots, so undo/redo
  and dirty tracking see heal strokes like any other develop setting,
  and copy/paste of settings carries them through the existing payload
  sanitize.
- `studioSession.ts`: the heal is source preprocessing, not an engine
  knob. The loaded-source identity is now `name|spotSignature`; when a
  session has spots, `ensureEngineSource` decodes the untouched library
  bytes, stamps the spots into a fresh PNG (`healSource`) and hands
  that to the engine. Preview and export therefore both carry the heal
  through the real engine pipeline with no engine-contract change, and
  the P43 reload machinery re-heals automatically whenever the spot
  list changes. The raw bytes in `sources` stay pristine, so undoing
  the last stroke re-loads the true source, and compare/split still
  show the genuine original for free.
- `PhotosWorkspace.tsx`: a "Clone stamp" toggle (new `Bandage` icon)
  sits next to Crop and is disabled while cropping. In heal mode the
  stage shows a crosshair and an SVG brush cursor (accent ring sized by
  the radius); pressing starts the target, dragging previews the target
  and source rings with a connecting line, and releasing commits
  exactly one settings step (one undo click). A drag shorter than 1% of
  the frame is ignored. The brush radius slider (0.5%-20% of the short
  side) persists via `usePanelState('photos.healRadius')`. Heal mode
  never pans; zoom and pan gestures are unchanged outside it.
- i18n: `photos.heal.toggle` / `photos.heal.radius` in all five photo
  locales (en, de, es, fr, pt-BR).
- P45: a plain click (no drag) heals in one step — `autoSource` samples
  eight source discs around the target at 2.2x the radius, scores each
  by strided luma variance, and picks the flattest (flat surroundings
  are the safe clone source for specks and blemishes); candidates that
  would leave the frame are skipped, and the click is a no-op when none
  fit. One click is one undo step, same as a drag stroke.
- P48: a heal drag chains spots along the pointer path (every half
  radius, short-side metric), all sharing the release offset: paint
  across a scratch, let go on a clean area, and every point of the
  stroke heals from that one direction - one commit, one undo step,
  capped to the spot budget. Click auto-source is unchanged.

## Coverage

- Unit: `src/lib/photos/healSpots.test.ts` (10 tests: clamping,
  validation, signature stability, empty passthrough, opaque-core and
  soft-edge coverage, multi-spot ordering, auto-source flatness choice
  with determinism, auto-source bounds/null). The full photos suite —
  121 tests including the new file — passes with every pre-existing
  test unmodified.
- Browser: `test/design-system/photos-heal.spec.ts` drives the real
  workspace via the `?view=photos-heal` gallery route on an engine that
  truly decodes its loaded bytes: a drag from the red defect block onto
  the clean green flips the target pixel from `rgb(210,40,40)` to
  `rgb(40,140,80)`, and one undo restores the canvas bitmap
  byte-for-byte; a second test clicks the defect without dragging and
  asserts the auto-picked source heals it pixel-exactly; a third drags
  a stroke through the defect, releases on clean green, and asserts the
  defect's mid-point is healed (the start point alone would not reach
  it) with one undo restoring the bitmap. The light/dark
  theme test shows the active toggle, radius slider and brush cursor;
  its canvas bitmaps are pixel-identical to the P44 base (3bb96d93) run
  with the same proof and spec.

## Heal mode (P62)

The stamp gains an optional `mode: 'clone' | 'heal'` per spot
(absent = clone, so existing spots and payloads are unchanged). Clone
still copies the source verbatim. Heal keeps the source's texture but
shifts it to the destination surround: `applySpots` computes the
coverage-weighted source mean and the mean of a clean annulus
(1.0-1.4x radius) around the target and adds the difference before
feathering, clamped to the channel range. When the annulus has no
samples (stamp at the frame edge) the delta is zero and heal degrades
to clone. `spotSignature` covers the mode, so undo, dirty tracking
and the engine reload invariant see a mode flip like any other edit.

The workspace shows a small "Heal" toggle (panel-persisted
`photos.healMode`) next to the brush radius while the stamp tool is
armed; drag strokes and auto-source clicks stamp new spots with the
current mode. Unit tests pin the color adoption, the texture
preservation and the mode-aware validation/signature; the gallery
spec heals the red defect in heal mode in light and dark.
