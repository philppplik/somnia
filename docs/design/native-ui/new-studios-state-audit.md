# P11 new-studio state adoption

Audit on int/beta5, 2026-10-14. Interface, Animation and 3D canvas starters already use StudioEmptyState; their existing source actions are unchanged. 3D viewport loading/error and canvas Suspense loading already use StudioStatus.

Migrated remaining compact Interface panel/output errors and panel empties, Animation import/edit/snapshot/export notices, 3D scene-empty/notice/check-success, Vibe loading/pending/projection errors to StudioStatus. Existing text, classes, hooks and command callbacks remain. Static empty hints use live=off; async messages use polite; errors use assertive. Block display preserves paragraph flow. No new fake loading jobs.

Vibe's no-space page uses StudioEmptyState with its existing create-space capability gate. A new optional disabled prop preserves service gating for starter actions. It defaults false, so other consumers keep their existing behavior. The shared starter opens the existing folder/model form, not a native write or fallback project. The Vadivam bot remains. Scoped Vibe button rules exclude shared Buttons so they keep paired primary fill/ink in both schemes.

Intentional domain boundaries: the first-run template chooser, schedule-return card, unit-conversion decision, run failure/retry and review/consent cards keep structured content and their own actions. They are not generic starter or one-line status replacements. Graph/no-selection hints and timeline/document content keep their domain layout. No claim that every Vibe subsystem error is flattened into StudioStatus.

Evidence: StudioStateAdoption.test.tsx checks disabled create capability, no fake blank/file action, silent Interface empties, atomic polite/assertive semantics, escaped projection error and disabled writes, preserved export hooks and canvas boundaries. Existing Interface/Vibe render tests are unchanged. state-adoption.spec.ts exercises the actual Vibe home with an explicit empty offline transport, keyboard opens the local form, folderless create remains disabled, plus light/dark screenshots. Real app-engine E2E/native transport remain CI-only. No budgets, goldens or old assertions were raised or weakened.
