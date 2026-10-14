# P5 Settings slices, baseline-gated

No Appearance or Settings source rewrite in this preparation. BEFORE capture is owed from beta.4 CI;
this package has not received/inspected that artifact. A green build or screenshot file existing is not approval.

Gate: record actual source SHA/browser/fonts and artifact URL, verify all Settings modes/section manifests,
inspect PNG pixels, then pin the BEFORE package. The integrator owns that artifact acquisition.
Do not generate substitute baselines from current migrated code or update goldens to hide a mismatch.

Appearance first, separate commits:
1. Bare select/input wrappers only: retain exact IDs, classes, refs, aria labels, option values and live change handlers.
2. Field relationships: remove nested labels, join descriptions; keep focus/undo key behavior and translated names.
3. Numeric draft adapters only after proving current parse/commit/cancel equivalence; slider gesture ownership stays separate.
4. Group/section chrome only after geometry review in three modes plus narrow dialog and long locales.
5. Importer stays a separate component/store/Undo/Reset, not Appearance reset or document history.

Each slice: before/after using capture:settings, old settings-redesign/theme/surface/importer gates, computed paint,
geometry, keyboard focus/return, search and settings-only undo; record deviations rather than weakening tests.
Remaining sections follow the existing per-section checklist, not a single all-Settings patch.

Fixture scenarios prepared for review:
- theme light/dark/system, custom near-white/near-black accent and high contrast, imported/reset/denied-storage;
- density compact/normal/comfortable, UI scale 85/130, outer radius 0/25, long translated labels;
- selection of controls by native label, settings-only Ctrl+Z outside text inputs, search then clear;
- importer Apply/Undo/Reset independent of shell reset, app reload persistence.
Existing isolated gallery tests cover DS mechanisms only. Actual Appearance behavior is supplied by existing app tests;
additive beta.4 scenario capture in `test/settings-migration/appearance-fixtures.spec.ts` never mutates goldens.
