# Photos zoom presets (P39)

Sixth functional photo-studio feature phase. The Photos workspace zoom
bar gains one-click preset stops — 50%, 100%, 200%, 400% — the standard
inspection levels of a photo studio, alongside the existing fit and
actual-size controls.

## What changed

- `src/lib/photos/zoomPresets.ts`: pure helpers — `ZOOM_PRESETS`
  (ascending stops inside the workspace zoom range 0.02-16),
  `isZoomPresetActive(zoom, preset)` (a stop is active only when an
  explicit zoom sits on it; fit-to-window `null` never marks one) and
  `zoomPresetLabel(preset)` (rounded percent label).
- `PhotosWorkspace`: the bar renders one compact DS `Button` per stop
  between zoom-in and fit, each with `aria-pressed` tracking the active
  stop and an i18n `aria-label`. Clicking calls the existing `zoomTo`
  helper, so the zoom recenters on the view centre and stays clamped —
  the same path the +/- buttons and the wheel use. The 100% stop keeps
  the current pan anchor; the existing "Actual size" button (which also
  resets pan) is untouched, and fit still clears the explicit zoom.
- i18n: `photos.zoom.preset` (`{pct}` parameter) in all five photo
  locales (en, de, es, fr, pt-BR).

## Coverage

- Unit: `src/lib/photos/zoomPresets.test.ts` (4 tests: stops ascending
  and in range including 100%, active only on explicit match with float
  tolerance, null zoom never active, percent labels). All existing
  photos tests unmodified and passing (102 tests including P34-P38
  additions).
- Browser: `test/design-system/photos-zoom.spec.ts` drives a real
  workspace fed by the media store like `PhotosCanvas` via the
  `?view=photos-zoom` gallery route: fit is pressed initially, clicking
  100/200/400/50% updates the level readout and the pressed stop, fit
  clears the stops again; light/dark production-style screenshots at
  200% (`test-results/ds-photos-zoom-{light,dark}.png`).
- Pixel parity: stage captures at fit
  (`ds-photos-zoom-stage-{light,dark}.png`) are pixel-identical to a
  base-tree run (tip `316cd01b` + proof/route/spec only) in both
  themes; the feature adds only the bar controls.
- No new raw controls (buttons are the DS `Button`); ratchets unchanged.
  Actual app photos E2E remains CI-only.

## Zoom keys (P72)

The workspace zooms from the keyboard now: `+` (and `=`) steps in, `-`
(and `_`) steps out, in the same 1.25x increments as the zoom buttons,
leaving fit-to-window on the first press. The keys live in the existing
workspace key handler with the same guards (no modifiers, no editable
targets) alongside arrows, ratings, flags and the `O` guide-style cycle;
the handler effect was moved below the `zoomTo`/`scale` declarations so
the dependency list is TDZ-safe.

Coverage: `photos-zoom.spec.ts` gains a light/dark leg that presses
`+`, asserts the level readout rises and fit disengages, steps back out
with `-` and screenshots the zoomed stage.

## Zoom toggle key (P77)

The `Z` key flips between fit-to-window and 100% — the exact states of
the fit/actual buttons, pan reset included. Same key-handler guards as
the other workspace keys.

Coverage: `photos-zoom.spec.ts` gains a light/dark leg that presses
`Z`, asserts the 100% level readout and the active preset marker,
screenshots, and presses `Z` again back to fit.
