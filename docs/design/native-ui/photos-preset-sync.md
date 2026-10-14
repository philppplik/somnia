# Photos preset sync — apply a look to the whole library (P49)

Eleventh functional photo-studio feature phase: batch processing for
presets. One click applies any built-in or user preset to every
developable photo in the library — the "presets sync" half of the
classic batch workflow (batch export already exists, P42).

## What changed

- `src/lib/photos/batchExport.ts`: `syncLookToPhotos(items,look,onProgress)`
  runs the existing failure-isolated batch machinery
  (`runPhotoBatch`) over the library: each photo is opened and waited
  on (`ensurePhotoReady`), then receives ONE settings commit
  (`applyLook`, which replaces the look keys on a neutral base). One
  commit per photo means one undo step per photo; geometry, heal
  spots, dodge dabs and crop stay per photo because a look never
  carries them. A photo that fails to open (corrupt, unsupported)
  lands in the outcome's `failed` list and never aborts the run.
- `PresetsPanel.tsx`: every built-in preset row and every user preset
  row gains a ghost icon button (Layers icon, "Apply to all photos")
  once the library holds at least two developable photos. While a sync
  runs, all sync buttons disable and a polite live-region status line
  shows progress (`Applying n of m…`), then the summary
  (`Preset sync: x applied, y failed`) with the failed names appended.
  The per-photo apply button stays the primary action; sync is the
  row's secondary icon.
- i18n: `photos.p.presets.sync`, `.syncProgress`, `.syncSummary`,
  `.syncFailures` in all five locales.

## Honesty / scope notes

- This is a real batch apply: each photo's session is opened and its
  settings committed individually — undo history, dirty tracking and
  the filmstrip badge all behave exactly as if the user had applied
  the preset photo by photo.
- Sync REPLACES the look on each photo (neutral base, same semantics
  as the per-photo apply button) instead of stacking onto existing
  edits; tonal work the user already did on a photo is reset by the
  look, geometry never is.
- No new dependencies, no WASM; the sync path reuses the export
  batch's progress and failure-isolation plumbing.

## Tests

- `src/lib/photos/presetSync.test.ts`: applies a look to two photos as
  one commit each with geometry untouched; a second sync replaces the
  first look instead of stacking; a photo that cannot open
  (`image/tiff`) lands in `failed` while the rest still apply.
- Gallery `?view=photos-presets`: real workspace plus the real presets
  panel, three gradient PNGs and a settings-aware fake engine
  (contrast scales the channels). The spec captures a baseline bitmap
  per photo via the filmstrip, clicks "apply vivid to all", waits for
  the `3 applied, 0 failed` summary and asserts every photo's bitmap
  changed with channels scaled ~x1.18, then undoes once and proves
  only the active photo reverts. Light/dark screenshots; canvas
  bitmaps byte-identical to the P48 base (c9110a49) — the feature is
  inert until clicked.
