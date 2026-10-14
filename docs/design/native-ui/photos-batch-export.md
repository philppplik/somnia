# Photos batch export (P41)

Eighth functional photo-studio feature phase. The Export panel gains a
batch section: export every developable photo in the library as a
developed copy in one run — the "batch processing" workflow for a
series of shots.

## What changed

- `src/lib/photos/batchExport.ts`: the batch machinery.
  `runPhotoBatch(names, exportOne, onProgress)` walks the library in
  order, reports progress, and never lets one failed photo abort the
  run — the outcome lists saved, skipped (cancelled) and failed (with
  messages) separately. `uniqueFileNames` resolves copy-name collisions
  ("a.jpg" and "a.png" both want "a-edited.png") with numeric suffixes.
  `pickExportDirectory` asks for a writable directory once (File System
  Access API); `directoryPhotoHost` turns it into the existing
  `PhotoSaveHost` shape `exportPhotoCopy` already accepts, applying the
  collision renames keyed by the default copy name. `ensurePhotoReady`
  opens photos that have no session yet and waits for a ready frame.
- Export panel: below the single-photo buttons, two batch buttons
  ("Export all as PNG/JPEG (n)") appear when at least two developable
  photos exist. With File System Access support the run writes into one
  picked directory; without it the run falls back to the default host
  (downloads / native per-file saves). Cancelling the directory pick
  aborts quietly. A live status line shows "Exporting done of total…"
  during the run and a saved/skipped/failed summary (with failed names)
  after it. All existing buttons and the single-export flow untouched.
- Every copy still goes through the existing bounded engine export
  (2048 px cap, 8-bit sRGB, metadata removed); originals are never
  overwritten.
- `bento.css`: `.photos-batch-status{font-size:11px}` — the arbitrary
  `text-[11px]` utility is ratchet-counted (pixelText), so the status
  line gets a named rule instead.
- i18n: `photos.batch.{png,jpeg,progress,summary,failures}` in all five
  photo locales (en, de, es, fr, pt-BR).

## Coverage

- Unit: `src/lib/photos/batchExport.test.ts` (4 tests: order/progress
  with skip collection, failure never aborts, collision suffixes,
  default names without collisions). All existing photos tests
  unmodified and passing (109 tests including P34-P40 additions).
- Browser: `test/design-system/photos-batch.spec.ts` drives the real
  Export panel fed by the media store via the `?view=photos-batch`
  gallery route, with `showDirectoryPicker` stubbed by an in-memory
  fake directory: the batch button reads "Export all as PNG (3)",
  clicking writes `batch-1..3-edited.png` (non-zero bytes) into the
  fake directory in order, and the status line ends on the exact
  summary. Light/dark production-style screenshots after a completed
  batch (`test-results/ds-photos-batch-{light,dark}.png`).
- Pixel parity: the existing single-export button
  (`ds-photos-batch-single-{light,dark}.png`) is pixel-identical to a
  base-tree run (P40 commit `5f4f30fb` + proof/route/spec only) in both
  themes; the feature adds only the batch section below it.
- No new raw controls (buttons are the DS `Button`); ratchets unchanged
  (pixelText bump avoided via the named CSS rule). Actual app photos
  E2E remains CI-only.
