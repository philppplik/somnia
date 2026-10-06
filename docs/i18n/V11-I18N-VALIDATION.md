# v11 i18n validation

Base: `10c6989` (v10.1.0, `phase1-foundation`). Branch: `v11/i18n-finish`.

## Automated checks actually run

- `npm ci --ignore-scripts`: completed; npm reported no vulnerabilities at installation time.
- `npm run typecheck`: passed.
- `npm run build`: passed. Existing large-chunk / ineffective dynamic import warnings remain; this is not a clean-warning claim.
- `npm run test:core`: 331 passed, 0 failed.
- `npx playwright test tests/i18n*.spec.ts tests/extension-catalog*.spec.ts tests/settings*.spec.ts --workers=2`: 38 passed, 0 failed on the final combined run.
- `git diff --check`: passed.

The new six browser tests cover all five locales and live language switching. Fixture packages are intercepted locally; no real GitHub extension is installed. Tests verify translated safety warnings, permission explanations, category/state/action labels, raw HTTP diagnostic preservation, disabled-after-install behavior, unchanged publisher descriptions and unchanged extension theme labels. Existing Settings tests were updated to the now-translated accessible names, including units. A readiness race in the new test was fixed by opening Settings through its rendered button rather than sending a shortcut before the app had mounted.

## Visual inspection actually performed

Viewed the rendered PNGs, not just assertions: Spanish and French package review at 110% UI size, Portuguese appearance in light and dark at 110%, and English Settings at a 760 x 560 window. Review warnings and install/cancel actions were readable and fit; the hash wraps within its panel, and the close control remains visible. The sidebar and content scroll independently; screenshots do not show every section at once. The long French search placeholder is truncated at the existing narrow sidebar width; its accessible name remains complete. No new layout styling was introduced in this pass.

## Not established by these checks

- No Windows, native Tauri window/menu, installer or signed-updater validation.
- No native-speaker certification for es/fr/pt-BR.
- No screen-reader run.
- No claim that every runtime diagnostic or every newer UI panel has been localized. See `TRANSLATION-REVIEW.md` for remaining examples and the review gate.
- No live GitHub catalogue availability test; tests use deterministic network fixtures.
