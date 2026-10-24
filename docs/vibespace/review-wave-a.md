# Wave A review implementation

Base: main 04bc442. A5 owns new review operations. Existing whole-path apply and Runtime::open stay unchanged. The engine Usage follow-up from A10 is a prerequisite for the metering commit (cache_read_tokens, cache_write_tokens, cost_usd, cost_source).

## Public additions

- Checkpoints: `text_hunks`, digest-bound hunk IDs, `Selection::Hunks {paths,hunks}`. IDs, not caller offsets/text, select native-generated unified diff hunks. Only modified UTF-8 files without mode changes support partial hunks. Added/deleted/binary/mode-only files use whole-path selection. Full isolated-file digest still checked before synthesis. Duplicate IDs/path overlap and unknown IDs refuse. Existing conflict/backup/journal/rollback routes stay in use.
- Final hunk apply is one final selection, not staged remaining-hunk review. Only chosen changes land. The operation prefix `apply-hunks-` is atomically persisted through existing artifact_operations and checkpoint intent before writes. Recovery uses it to mark Applied after commit even when unselected changes remain in the isolated proposal. Never mark Applied after rollback. UI explains this before confirmation.
- Rust Core + Desktop: `vibespace_review_hunks`, `vibespace_run_timeline`, `vibespace_apply_hunks`, `vibespace_request_changes`. Commands use main-window origin gate and existing native-files gate. Native capability discovery gates mutations, no fixture fallback.
- Request changes creates a new Studio and new run, preserving the old proposal/history. Scope and model remain unchanged. Original goal is retained; an over-limit combined goal refuses visibly rather than silently dropping instructions. Bounded prior text diff is untrusted context, not an instruction or permission. It starts in a fresh snapshot of the current project, then goes through fresh policy, consent and review. Binary proposal content is not supplied to the model. This is not in-place continuation of the old isolated copy. storage/review.rs creates the successor and terminal review audit atomically with idempotent request identity; generic terminal agent events remain forbidden. No migration/schema changes.
- Review checks are actual native digest/scope and concurrent-edit checks. Project shell/tests remain explicitly Not run until a safety runner is available. The HTML/SVG preview is sandboxed with no scripts, network, forms, navigation authority or filesystem access. Other text shows a safe text preview, binary stays metadata-only. Office/raster native studio previews remain an integration extension, not claimed complete here.
- Timeline comes from durable native events and includes steps, consent decisions, preparation and review operations. Raw event payloads are not exposed. Per-step usage stays distinct from aggregate usage. Native meter keeps cache read/write optional: missing is unknown, not zero. Input numbers retain provider semantics; no cached counts are added to/subtracted from input. Mixed cost reporting is a labelled provider-reported subtotal. No local monetary cost or guessed price tables.

## Pause/resume

Disabled with explicit explanation. See pause-resume-contract.md for compatibility finding, exact Rust-owned API, persistence and acceptance gates. No fake TS pause or cancel/resume substitute.

## Tests and environment

Standalone cargo tests for checkpoints, core, storage. Desktop no-default-features tests run locally. Full desktop feature check needs Linux glib/WebKit development libraries unavailable in this container, so actual native handler compilation/smoke remains a CI and platform gate. No Windows runtime tested.

TS controller/native/DTO/locale/component suites plus targeted typecheck. Browser fixture is explicit and offline:

```
cd phase1
npx tsx --test src/lib/vibespace/*.test.ts src/components/vibespace/*.test.tsx src/lib/tauriPermissions.test.ts
npx tsc -p test/vibespace/tsconfig.json --noEmit
npx playwright test -c scripts/vibespace-review/playwright.config.ts
```

The fixture server deliberately bypasses unrelated WASM bridge prerequisites; it imports real Vibe Space components. Screenshots live in test-results/. These are browser fixtures, not real-model or native platform smoke. jsdom component QA needs a local jsdom install; it was installed without changing dependencies/lockfiles.

## Integration notes

- A1 Runtime::open ownership change is untouched. Review runtime.rs additions and storage lib.rs module union with A3/A6. runs.rs only widens two helpers to pub(crate); terminal-event policy stays unchanged.
- Four new commands registered in build.rs, editor.json and desktop invoke_handler. gen-commands.mjs now discovers macro-generated sync_command! signatures, fixing a pre-existing generator failure on vibespace_create_space. Regeneration includes baseline missing Vibe Space signatures. Rerun command manifest and permission checks after union integration.
- 44 new keys were already appended to the shared five locale JSONs before catalog-split guidance arrived. Union merge per the approved exception. No keys removed.
