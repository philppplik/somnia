# Handover: git-variants-conflicts (package E)

Branch `agent/git-variants` on top of `agent/git-git-core` (dacf48a). Contract: `docs/git/CONTRACT.md`, section CONTRACT-E.

## What is in it
- `phase1/src-tauri/src/git/variants.rs` (+ `pub mod variants;` in `git.rs`): variant list/create/open/rename/delete, combine preview/start/status/resolve/finish/abort.
- `desktop.rs`, `build.rs`, `capabilities/editor.json`: 11 new commands, `{ request }` payloads like package A.
- `phase1/src-tauri/tests/git_variants.rs`: 12 integration tests on real temp repos.
- `phase1/src/lib/git/`: types (CONTRACT-E block), `variantsBackend.ts` (Tauri adapter), `variantsFlow.ts` (guards, drafts, flows, error keys), `fakeVariantsBackend.ts`, `variantsFlow.test.ts`.
- `phase1/src/components/versions/`: `VariantsTab.tsx` (tab content), `ConflictResolver.tsx` (3 columns), `VariantsTab.test.tsx`. Styles `src/styles/variants.css`.
- i18n `variants.*` in en + de.

## Integration (not done here, depends on packages B/C)
- The Versions panel from package B does not exist in this base. Mount `<VariantsTab deps={{git, variants: tauriVariantsBackend(invoke), guards}} onDiskChanged onSaveVersion onRepoChanged/>` as the Variants tab. `guards` must come from the editor (unsaved buffers, open AI reviews). `onDiskChanged` must reload project files.
- On startup call (or mount) the tab so `combineStatus` resumes a running combine.

## Gates run locally
- `cargo test --no-default-features --locked`: all suites green (A's 24 + 25, E's 12, lib 53).
- `npm run test:core`: 1486 tests, 0 failed. `tsc --noEmit`: clean.

## Not verified
- `desktop.rs` was edited but not compiled here (default features need glib/webkit, not installed). The additions are mechanical copies of package A's command pattern; CI/integrator must build with default features.
- No Windows/macOS run, no visual check of the dialogs, no screen reader pass, no real browser.
- es, fr, pt-BR contain the English text for `variants.*` (placeholders so the key-parity test passes); they need the usual translation pass.
- Git 2.34 (Linux) was the only version tested.

## Decisions to know
- Combine uses real `git merge --no-ff --no-commit` instead of a scratch-index preview: renames and git's own merge strategy apply exactly, and merge state survives a restart. Cost: the folder changes while resolving (needs a clean folder first; safety copy taken; abort restores).
- Hooks run on switch (post-checkout) and finish (commit hooks), so both need the repo trust from package A.
