# Settings area DS adoption (P23)

All raw `<button>`/`<input>`/`<select>` controls in the flat Settings files
(`Settings.tsx`, `GlassSettings.tsx`, `ModifiedSettings.tsx`,
`FrameworkSettings.tsx`, `LanHostSettings.tsx`, `SettingsSearchResults.tsx` —
98 controls across 6 files) now render through the geometry-free native
control primitives (`NativeButton`, `NativeInput`, `NativeSelect` from
`ui/native-controls`). Element-owner swap only; no restyle, no behavior
change.

- Ratchet: all 6 file allowances are at zero; the flat-files area totals
  dropped accordingly (121 button / 70 input / 20 select / 8 textarea
  remaining, all outside the Settings files).
- Unit coverage: `src/components/SettingsAdoption.test.tsx` (no-raw-control
  source scan per file plus capture-harness section contract). Existing
  Settings-related tests are unmodified.
- Capture evidence: `SOMNIA_SETTINGS_CAPTURE=after-ds-settings npm run
  capture:settings` against the migrated tree, compared with a same-tip
  BEFORE capture (`before-tip`, origin/int/beta5 4fedb336) using
  `scripts/compare-settings-captures.mjs`: section/control contract and
  screenshot inventory match. Pixels: 69 of 72 PNGs byte-identical; the
  three `*-updates-top.png` differ only in the dynamic "last checked"
  timestamp text (23x9 px), both states "up to date".
- The delivered beta.4 BEFORE bundle (label `before-beta4`) is historical:
  upstream changed the Modified, Appearance, AI and Advanced sections
  between beta.4 (7b9e8ba5) and the current tip, so those sections cannot
  be pixel-compared against beta.4; the same-tip comparison above isolates
  this migration exactly.
- Capture caveat: the harness web server requires the WASM bridges; for the
  local capture the dev-server craft check was bypassed with a throwaway
  config (`vite` directly, not committed). No cargo/WASM was built.
- Actual app Settings E2E remains CI-only.
