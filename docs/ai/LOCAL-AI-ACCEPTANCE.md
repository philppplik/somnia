# Local AI acceptance: A-V

Status: pending evidence, not a CI result. Every checkbox below starts unchecked. A development unit/fixture pass does not establish native compilation, real model behavior or release safety. No CI run/artifact was read or dispatched for this document.

The letter series names later development slices. Earlier A-C also contain follow-up vision, voice and streaming work; D includes read-only alternate discovery plus later routing. Rows name the actual scope instead of claiming one letter was one commit. Verify the integrated tip contains V before testing its checks.

## Record each acceptance

For every tick record: commit SHA, CI run URL/artifact, target/build flags, fixture versus native/device, exact model digest and daemon version where relevant, hardware where relevant, reviewer/date and failures/skips. A missing artifact, disabled feature, absent test or Unknown result remains unchecked. A CI pass on one target does not cover another. Record work requiring new device/packaged tests as a gap, not as an existing automated suite.

### A: read-only Ollama inventory

- [ ] Native metadata parser, trusted editor IPC, loopback/proxy/redirect/body/time limits.
- [ ] Full app Local navigation and stale hidden-tab result handling.

Source and remaining evidence: `src-tauri/src/local_models.rs`; `tests/local-models.spec.ts`; `docs/ai/LOCAL-MODELS-PHASE-A.md`. Windows/macOS/Linux executable detection and packaged webview access need device receipts.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

### B: lifecycle and bounded streams

- [ ] Native start/pull/update/delete, NDJSON terminal reconciliation, owned cancel, loaded/digest/reference refusal.
- [ ] Request timeout/context propagation and no success after partial EOF.

Source and remaining evidence: `src-tauri/src/local_model_actions.rs`, Agent Ollama provider; phase B doc. Real shared daemon races/cancel outcome and nonstandard installs remain device checks.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

### C: hardware/catalog, advanced/vision/voice/stream follow-ups

- [ ] Native hardware parser/probes, saved context/keep-alive roundtrip.
- [ ] Vision capability refusal and reviewed application through generated engine bridges.
- [ ] Native opt-in STT and default-off experimental text-stream candidate compile/tests.

Source and remaining evidence: `local_hardware.rs`, `agent_settings.rs`, `local_voice.rs`, `tests/local-vision-application.spec.ts`; advanced/vision docs. Native probes/real image quality are target-device checks. C stream/voice work is not enabled by acceptance of hardware alone.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

### D: alternate discovery and explicit provider routing

- [ ] Native alternate-runtime IPC/CLI execution bounds.
- [ ] Preference migration/local-only restore fails closed; cloud start/consumption and previously resolved transport guards.
- [ ] General-chat fallback does not replay tools, images, context or output.

Source and remaining evidence: `docs/ai/LOCAL-RUNTIME-DISCOVERY.md`, `phase1/docs/concepts/provider-routing-phase-d.md`; `src-tauri/src/agent_settings.rs`, CLI and Vibe transport. Protected/real servers and cancellation of already sent work need target evidence.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

### E: Vibe exact model locality

- [ ] Native classifier and per-request guard for initial/later/scheduled requests; reject remote markers, cloud aliases, missing/malformed evidence.
- [ ] Verified Ollama remains usable in local-only mode.

Source and remaining evidence: `src-tauri/src/model_locality.rs`, Vibe engine/core, phase E concept. Real daemon identity changes/races and packaged dispatch remain unverified. Daemon self-report cannot attest a malicious server.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

### F: LM Studio boundary and onboarding

- [ ] Native LM Studio local-only refusal stays in place despite plausible loaded metadata.
- [ ] Full app onboarding errors/manual refresh do not start/load/download.

Source and remaining evidence: phase F concept; local-readiness fixtures. A real execution-device attestation is still absent; do not tick "LM Studio verified local" because inventory responds.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

### G: Vibe streaming UX

- [ ] Native provisional persistence, stop/failure recovery; whole-file/hunk Apply refuses partial review.
- [ ] Real project unchanged before complete accepted review.

Source and remaining evidence: phase G concept, `vibespace-core`, `test/vibe-stream-ux-playwright.config.ts`, stream workflow. Default flag remains off. Actual experimental transport requires separate explicit target receipt.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

### H: summary, feedback successor, history

- [ ] Native storage transaction/idempotency and current-baseline successor creation; no old tool/permission replay.
- [ ] Native summary/check projection and board filters preserve unfiltered active totals.

Source and remaining evidence: phase H concept; core/storage and run-quality fixture. Applied details may be unavailable; do not infer them from proposed files. Real retry/project/restart tests remain.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

### I: reported usage and capped mode

- [ ] SQLite migration and full-history usage decoding.
- [ ] Native request admission blocks cloud/unknown locality, reports usage before next step, cancels board work and revokes effects.
- [ ] Scheduled/retried/parallel/restart coverage, malformed/missing usage denial.

Source and remaining evidence: `vibespace-storage/src/board_budget.rs`, core budget transport, phase I concept. Threshold is post-hoc, not strict token/spend reservation, even after tests pass.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

### J: manager advice/last-use/disk

- [ ] Native volume token checks and true selected-volume capacity.
- [ ] Packaged manager and fresh saved-use/digest/loaded deletion guards.
- [ ] Agent successful-use recording without prompts/telemetry.

Source and remaining evidence: phase J concept; `local_model_disk.rs`, manager fixture. Last-use excludes native Vibe/other clients; actual model storage path and capacity remain separate evidence.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

### K: optional voice prompt/lifecycle

- [ ] Native exact language/manifest/default-off/model-download contracts.
- [ ] Packaged capture permission, denied/disconnected device, decoding, cancel/unmount, draft-change refusal.

Source and remaining evidence: phase K concept, nativeVoice/voiceInput/local_voice. Real DE/EN speech accuracy and scratch retention audit still absent. TTS is not implemented.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

### L: local comparison

- [ ] Packaged exact installed digest before/after, local-only provider, timeout/cancel/no tools.
- [ ] Real one-run latency/output provenance, bounded local save/open/delete across restart.

Source and remaining evidence: `src/lib/agent/localComparison.ts`, comparison fixture. Synthetic timing/output is not real model performance; live test needs digest/runtime/hardware.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

### M: per-task routing

- [ ] Native preference roundtrip and saved task deletion protection.
- [ ] Packaged task precedence, missing model refusal, explicit Vibe adoption with existing Studios pinned.

Source and remaining evidence: task-routing phase M doc; `agent_settings.rs`, task-routing fixture. No cloud override fallback or task inference.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

### N: push-to-talk hardening

- [ ] Packaged microphone meter/startup cleanup, late permission, focus/pointer/key cancel, bounded safe errors.
- [ ] Native capture/transcription integration, no send until insertion and normal send.

Source and remaining evidence: push-to-talk phase N doc; voice-prompt fixture. Optional artifact plan is not an artifact.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

### O: optional install/repair/remove

- [ ] Native exact byte/hash/notices/target/review gates, cancel/disk pressure/atomic repair, symlink refusal and exclusive startup cleanup.
- [ ] Real current-executable rehash and parent-death/job behavior.

Source and remaining evidence: helper-install phase O doc; `voice_helper.rs`, `local_voice.rs`. Inventory remains empty; real assets and production isolation are not established.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

### P: review-only CI and model size

- [ ] Manual native-contract Linux/Windows matrix; abrupt-parent and startup contender receipts.
- [ ] Audited helper build, actual artifact hashes, hostile-negative-control egress evidence.
- [ ] Packaged logical model-byte display/unknown coverage.

Source and remaining evidence: `local-voice-helper.yml`, voice-ci phase P doc. Namespace/firewall harness is not production sandbox enforcement. Missing audit fails before helper build; do not work around it.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

### Q: license evidence and comparison transfer

- [ ] Actual per-target source/license/linkage inventory generation, reviewer sign-off covering static/dynamic/system components, exact current build evidence.
- [ ] Packaged explicit JSON review/import, fresh IDs/atomic preservation/unverified marker.

Source and remaining evidence: license-inventory phase Q doc; voice inventory/build scripts and comparison transfer fixture. Generated inventory stays unreviewed until human review; source MIT alone is insufficient.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

### R: context, budget estimate, templates

- [ ] Full app source omission reaches native snapshots/tools; scope change prevents stale history replay and no cloud fallback.
- [ ] Document ceiling/selection/studio exclusion and template persistence at actual request boundary.

Source and remaining evidence: local-assistant phase R doc; core/panel/localAssistant tests and fixture. Estimate excludes schemas/history/media/tool results. Verify no reintroduced type-import cycles.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

### S: health/offline/retry

- [ ] Native offline schema/save/startup restore and cloud/fallback denial in renderer/native/Vibe.
- [ ] Packaged exact health states, fresh exact-model retry review/disk receipt.

Source and remaining evidence: model-recovery phase S doc; agent settings/native guards and recovery fixture. Retry is a new pull, not guaranteed offset resume; loaded metadata is not quality.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

### T: task evaluation

- [ ] Packaged explicit one/two-model task run, task-edit retention, single-row persistence/export/import and selective boundaries.
- [ ] Real exact-model local inference with tagged latency; no code/tool execution.

Source and remaining evidence: local-evaluation phase T doc; evaluation unit/fixture. No automated quality score/benchmark claim.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

### U: helper status/fake process integration

- [ ] Native fake Rust worker kill/reap-before-scratch; startup/orphan tests on both targets.
- [ ] Packaged voice UI integration with real adapter only after artifact gates.

Source and remaining evidence: voice-helper phase U doc; fake JS/port/voice fixture. Fake "isolation=true" only tests ordering. Linux hostile grandchildren and Windows spawn-assignment window remain release blockers, not satisfied checks.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

### V: per-store privacy/export/delete

- [ ] Native bounded helper inventory, links/owner contention/disabled-build exclusive removal, model preservation and desktop IPC compile.
- [ ] Packaged saved-offline-only reset preserves routes/credentials; subset history delete/export and restart; no sync/upload.

Source and remaining evidence: local-privacy phase V doc; localPrivacy/fixture, `local_voice_storage_*`. Logical JSON size is not disk allocation. Unknown is not zero; no full-device secure-wipe claim.

Evidence: commit ___; CI/artifact ___; target/flags ___; reviewer/date ___; gaps ___

All paths beginning `src/`, `src-tauri/`, `test/`, `tests/` or `vibespace-` in the phase sections are relative to `phase1/`; `docs/ai/` is repository-root unless prefixed with `phase1/`.

## Existing CI entry points, not evidence of execution

- `.github/workflows/phase1-core-bootstrap.yml`: existing generated-engine build, frontend build/core tests, full app E2E, native no-default-features tests, Vibe crate suites and desktop command tests. Inspect its current job filters/matrix and artifact results for the exact commit; a workflow file is not a pass.
- `.github/workflows/vibe-stream-candidate.yml`: experimental engine/core checks. Passing this does not enable the default-off transport or certify complete app streaming.
- `.github/workflows/local-voice-helper.yml`: manual-only public standard Linux/Windows runners. Native contract work is separate from optional inventory/build/egress inputs. Audited helper jobs deliberately fail without reviewed target audits. No macOS helper release is covered by this matrix. Do not dispatch, fund or change gates merely to tick this file.
- Isolated Playwright configs under `phase1/test/` and `phase1/local-models.playwright.config.ts` use synthetic/injected transport. Many are not automatically covered by the regular full-app E2E command. Check job wiring or run the relevant config in an authorized CI job and record it as fixture evidence only.

From `phase1/`, existing frontend acceptance commands are `npm run check:commands`, `npm run check:ds`, `npm run check:layers`, `npm run build`, `npm run test:core` and `npm run test:e2e`. A failed prerequisite stays failed. Do not raise DS budgets or ignore/delete tests. The layer checker currently warns about incompatible TypeScript transpilation and ignores a baseline, so a green exit is not complete dependency proof; restore compatible analysis in CI or inspect affected edges explicitly. Missing generated engine assets or missing three/Studio3D dependencies are build blockers, not reasons to declare typecheck green.

Native/packaged/device tasks remain CI-only or owner-device validation. This document did not run cargo, build WASM, download weights/helpers, contact providers, spend money or validate any acceptance checkbox.

## Voice release stop list

- [ ] Real reviewed per-target linkage/license inventory and notices, matched to actual distributed bytes.
- [ ] Actual CI-produced size/hash and immutable reviewed delivery source; signatures only when a real signing path exists.
- [ ] Production runtime egress isolation, including IPv4/IPv6/loopback/DNS and hostile negative controls through the actual launch path.
- [ ] Abrupt owner death, grandchildren, spawn-assignment races, locked restart and scratch/staging cleanup through packaged runtime.
- [ ] Real microphone permission/error behavior, DE/EN speech accuracy, disk/repair/cancellation tests.
- [ ] Explicit reviewer decision for each target, with all failures/skips visible. Linux/Windows work does not approve macOS.

Until these are resolved, keep helper download optional, inventory unpromoted and preview default-off. Never replace missing evidence with a fake hash, source, audit approval or "local means safe" claim.
