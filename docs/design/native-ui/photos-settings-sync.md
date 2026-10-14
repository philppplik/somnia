# Photos settings sync: copy/paste develop settings (P37)

Fourth functional photo-studio feature phase. The Photos workspace bar
gains copy/paste for the full develop settings, the manual sync workflow
between photos (apply the same edit to a series of shots).

## What changed

- `src/lib/photos/settingsClipboard.ts`: pure payload helpers.
  `encodeSettingsPayload` wraps the full `PhotoSettings` (tonal, colour
  AND geometry: crop, straighten, orientation, flips — unlike presets,
  which intentionally never move geometry). `decodeSettingsPayload` is
  the untrusted read-back: wrong version, unknown keys or invalid
  geometry return null; out-of-range numbers clamp into engine ranges via
  `sanitizePhotoSettings`. `settingsPayloadToText`/`settingsPayloadFromText`
  carry a `somnia/photo-settings` kind marker for the optional system
  clipboard.
- `PhotosWorkspace`: two icon buttons in the bar after reset — Copy
  (`Copy` icon) and Paste (`ClipboardPaste`, new Vadivam icon export).
  Copy stores the payload in `panelStateStore` under
  `photos.settingsClipboard` (reactive: the paste button enables
  immediately, and the clipboard survives reloads, validated on read) and
  additionally writes the marked JSON to the system clipboard
  best-effort. Paste commits the decoded settings through
  `commitPhotoSettings`, so it renders immediately and is one undo step.
  The status note confirms both actions.
- i18n: `photos.settings.{copy,paste,copied,pasted}` in all five photo
  locales (en, de, es, fr, pt-BR).

## Coverage

- Unit: `src/lib/photos/settingsClipboard.test.ts` (5 tests: payload
  roundtrip preserves tonal/colour/geometry, text roundtrip with kind
  marker, garbage/version/unknown-key rejection, range clamping, invalid
  crop/orientation rejection). All existing photos tests unmodified and
  passing (95 tests including P34-P36 additions).
- Browser: `test/design-system/photos-sync.spec.ts` drives two real
  workspaces on one stubbed engine via the `?view=photos-sync` gallery
  route — A edited (warm), B neutral (cool): paste disabled before copy,
  copy enables it, paste fills B's history (undo enabled) and both
  workspaces show the same developed frame; light/dark production-style
  screenshots (`test-results/ds-photos-sync-{light,dark}.png`).
- Pixel parity: stage captures of workspace A
  (`ds-photos-sync-stage-{light,dark}.png`) are pixel-identical to a
  base-tree run (P36 commit `828a223c` + proof/route/spec only) in both
  themes; the feature adds only the two bar buttons.
- No new raw controls (both buttons are the DS `Button`); ratchets
  unchanged. Actual app photos E2E remains CI-only.
