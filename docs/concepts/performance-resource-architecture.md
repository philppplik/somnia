# Performance and resource architecture

Status: proposed concept, not implemented.
Date: 2026-10-13.
Source baseline: `origin/int/shell`, SHA `0a36de232a6bc7b180934a0c8e488e7b97138091`.

## Recommendation

Give the visible studio first claim on interactive resources, not unlimited power. Keep at most one recently used studio warm; deep-sleep other views and evict reconstructible resources under pressure. Documents, unsaved edits and jobs must survive view lifetimes. Use an application-owned resource coordinator, lazy hosts/engines, verified snapshots and job admission. Start with one shared shell WebView and worker-owned engines, not a WebView per studio. Saving, playback, collaboration and explicit exports remain protected even when their studio is hidden.

**Evidence labels:** Current = inspected source at the SHA above; proposed = future design/initial target; unverified = runtime behavior not measured here. No native application, engine round trip or performance benchmark was run for this concept. Numbers below are candidate criteria, not measured capacity or promises for arbitrary files.

## 1. Current source audit

Paths are relative to the repository root. Named functions make the audit recoverable as line numbers change.

| Area | Current evidence | Gap / implication |
| --- | --- | --- |
| Registry | `phase1/src/lib/studios/registry.ts`: `StudioDef`, `registerStudio`; `index.ts` imports all manifests | Metadata describes formats, commands and shell; no resource/lifecycle/snapshot contract. Keep manifests cheap and discoverable. |
| Host selection | `phase1/src/components/studios/hosts.tsx`: `StudioCanvas`, `StudioInspector`, `useHostStudio` | Chooses one active host, so do not claim every canvas renders simultaneously. Most hosts imported statically; Sheets uses `React.lazy`. Lazy UI does not prove engine release. |
| Panel registration | `phase1/src/components/studios/registerStudioPanels.ts` | Validates explicit hosts and returns a disposer. Preserve allowlist while separating metadata from heavy implementations. |
| Shell | `phase1/src/store/appStore.ts`, `shellLayoutStore.ts` | Per-document modes and panel layouts exist; broad subscription notifications merit profiling and narrower hot-path selectors. |
| Native shell | `phase1/src-tauri/tauri.conf.json`: configured `main` window | Shared shell; runtime-created auxiliary views need separate inventory. Native suspension cannot pause Photos alone while Code uses the same WebView. |
| Documents | `phase1/src/components/documents/DocumentsCanvas.tsx`: worker effect keyed by `item.url`; `lib/documents/engine.ts`: `dispose` | Worker ownership tied to view mount. Preserve current editing state/history outside the component before new suspension paths. |
| Sheets | `phase1/src/components/sheets/SheetsCanvas.tsx`: `Workbook`, engine effect, local draft/dirty state; `lib/sheets/session.ts`: dirty set | Cleanup disposes engine and clears dirty registration. State-retention hazard to test, not observed data loss. Dirty boolean alone cannot restore a workbook. |
| Slides | `phase1/src/lib/slides/session.ts`: `ensureSlides`, `bounded`, `renderSlide` | Three-session cap; clean inactive victim eviction; history <=10 entries / 64 MiB; observed WASM guard above 256 MiB after render. Useful precedents, not global pre-allocation limits. |
| Sound / Photos / Video | `phase1/src/lib/sound/session.ts`, `photos/studioSession.ts`, `video/session.ts`; corresponding engines | On-demand module-level engine creation, session maps and caches outlive views. Video also has filmstrip worker. No common view-sleep contract. |
| Worker termination | `phase1/src/lib/{documents,sheets,slides,sound,photos,video}/` | Existing disposal paths can be wrapped by adapters after authoritative state and job ownership are safe. |
| Extensions | `phase1/src/lib/extensions/runtime.ts`: `ExtensionRuntime` | Sandboxed worker per extension; checked API calls; activation/command timeout terminates worker (five-second default). Preserve failure/security properties. |
| Existing coverage | `phase1/tests/perf-large-projects.spec.ts` | 1,000-file folder, bounded rows, scrolling and save; not native RAM/CPU/startup or switch latency certification. |

**First safety gate:** test unsaved Documents/Sheets across studio switches and tab changes. Lift authoritative edit state/history into sessions before adding further unmount/eviction. Source inspection does not establish whether a released build loses edits.

## 2. Options and precedent

| Rank | Approach | Decision |
| --- | --- | --- |
| 1 | Shared shell, independent document sessions, lazy hosts, worker engines, app lifecycle | Default; smallest step from current source and portable policy. |
| 2 | Dedicated native job process for selected heavy operations | Later if measured contention, crashes or uninterruptible work justify IPC/deployment cost. |
| 3 | Separate WebView per studio | Not default; extra overhead, focus/accessibility and synchronization work; native suspend is platform-specific and not a hard quota. |

VS Code separates extension hosts and activates lazily [S1, S2]. Chrome freezing and discard/reload are different states [S5, S6]. These are useful patterns, not per-React-studio APIs. Figma uses feature-specific scenarios, noisy VM checks and targeted real devices [S3]. Its historical WASM startup improvement is not a Somnia speedup estimate [S4].

## 3. Ownership and lifecycle

Separate lifetimes:

- **Shell:** titlebar, pill, navigation, command metadata and lightweight job status.
- **Document session:** stable ID, source fingerprint, revision, dirty state, edit model, history and recovery data; independent of React.
- **Studio view:** caret/selection, viewport, panels and tool; replaceable.
- **Resource/job:** worker, WASM instance, decoder, GPU surface, playback, export/AI; leased independently of view effects.

Proposed services: `ResourceCoordinator` tracks dependencies, exclusive byte estimates, reconstructibility, last use and pin reasons; `DocumentSessionService` owns edits; `JobScheduler` admits work; `StudioRuntimeAdapter` loads, attaches, quiesces and disposes. These names are planned contracts, not existing classes. Shared bytes are counted once. A studio's many tabs do not each receive its full active allowance. Use stable document IDs, not display filenames.

| State | Retained | Work allowed |
| --- | --- | --- |
| Active | Visible view, engine, bounded interactive caches | Input, visible render, foreground commands |
| Warm | Session, view snapshot, bounded engine/cache | No continuous animation, thumbnail sweep, speculative decode or polling |
| Suspended / deep sleep | Verified current session checkpoint, small view metadata/preview | No view-owned workers, timers, decoder or GPU cache; separate job leases may run |
| Evicted | Durable source/recovery checkpoint and small index | No runtime data; reconstruct on demand |

Deep sleep here means **checkpoint and resource disposal**, not an opaque paused worker retaining all RAM. Warm retains resources for rapid reuse. Imported JS definitions may stay cached [S11]; eviction does not promise total code removal.

### Initial transition policy (proposed)

- One active view, at most one previous warm studio, 30-second warm grace. Empty/unvisited studios get no warm slot. Tune grace from measured return intervals and rebuild cost.
- Pressure bypasses grace: trim derived/offscreen caches, then warm resources, then clean suspended sessions. Enter pressure at 80% of selected envelope; exit below 65% for ten seconds. At 95% or native OS warning stop optional admission. Signals/thresholds need calibration.
- Hysteresis/cooldown prevents repeated rebuild/evict cycles. After repeated churn retain only cheap preview and queue expensive activation.
- Never evict the sole recoverable copy of unsaved edits. Dirty suspension requires verified current checkpoint. Failure pins session, reports in Problems and limits new heavy work.
- Recovery checkpoint does not mark document clean or save over source.
- IME composition, pointer transactions, recording, playback/presentation and non-cancellable write/commit sections supply owned pin reasons with completion handling, not permanent exceptions.

### Race-safe transition

1. Increment generation, block new view work, cancel obsolete previews.
2. Quiesce accepted edits at a safe transaction boundary; defer if input cannot safely commit.
3. Capture revision/view state; write and verify checkpoint/checksum.
4. Recheck revision and job leases. New edits invalidate snapshot; retry or pin.
5. Detach listeners/observers/timers, revoke disposable URLs, release GPU/decoder resources; dispose only unleased engines. Settle interrupted requests as cancelled, never successful.
6. Resume via one deduplicated activation promise; validate checkpoint/source versions and reject stale generation replies.
7. Show valid cached preview quickly, but enable editing only after verified restoration. Restore dirty state, undo/redo, caret, scroll and selection.

Failures retain recovery data and provide retry/error state. Never silently reopen original disk bytes over newer edits.

## 4. Snapshot and recovery contract

Versioned semantic snapshots contain ID, format/schema/engine version, source fingerprint, revision, working bytes or edit journal, history checkpoint, view state, referenced assets and checksum. Exclude pointers, worker handles, Blob URLs, GPU objects, API keys and auth credentials. Recreate transient handles and recheck file capabilities on resume.

| Studio | Authoritative recovery | Disposable resources |
| --- | --- | --- |
| Documents / Sheets / Slides | Current edited package or lossless engine snapshot plus history | Page/slide/cell render caches |
| Photos | Source + non-destructive recipe, masks/selections | Decoded pixels / proxy frame |
| Sound | Source, recipe, region edits, transport position; continuously durable recording output | Waveform/decoded caches |
| Video | Timeline, sources, trims, titles, transitions, transport | Frame ring, filmstrip; missing media enters relink state |
| Design / Vector / Code | Editable scene/buffers, asset refs, history, viewport | Derived geometry, thumbnails, decorations |
| Vibe Space / AI | Job IDs, workspace revision, reviewed/applied changes, pending decisions | Rendered log lists; never auto-replay external effects |

Exported bytes alone may not preserve engine history. Prove complete round trip or keep session pinned. Use incremental/debounced recovery during edits and transaction boundaries, not only unload: Chrome discard may have no final event [S5, S6]. Native atomic writes need verified commit; browser IndexedDB/OPFS needs quota/error testing. Snapshots stay private/local with retention/cleanup controls; encryption is an open decision. Corrupt snapshots, schema migration, storage-full and external/collaborative edits require explicit conflict recovery, not silent replacement.

## 5. Resource budgets and admission

One renderer has no OS quota per React component. Enforce queue admission, bounded caches, estimated allocations, concurrency and cooperative cancellation/yield. Worker isolation protects UI scheduling, not machine-wide capacity. Hard process controls require isolated processes and platform validation.

Account known ArrayBuffers, WASM linear-memory bytes, decoded assets and texture estimates separately from process-tree memory. Do not sum JS heap, WASM backing storage and RSS as independent quantities. GPU residency/shared WebView processes are not exactly attributable.

### Proposed normal profile (reference: 16 GiB RAM, SSD, >=4 logical CPUs)

| Bucket | Soft tracked-resource allowance | Reaction |
| --- | --- | --- |
| Shell/shared services | 256 MiB | Trim caches and profile growth; native/WebView overhead is additional |
| Active studio | 512 MiB | Drop offscreen resources; large-document mode needs admission |
| Previous warm studio | 128 MiB total | Otherwise snapshot/dispose |
| All suspended metadata/previews | 64 MiB total | Spill verified recovery/history to storage |
| Background jobs | 256 MiB shared | Queue/serialize if combined envelope cannot fit |
| Extensions/panels | 64 MiB estimated aggregate | Suspend/restart eligible idle runtimes; not a secure hard cap |

Buckets total **1,280 MiB**; initial normal admission envelope **1,536 MiB**, including 256 MiB transient/estimation margin. This is **not an OS RSS cap**: runtime/native overhead and GPU residency are outside this estimate. Measure whole process tree and select native ceilings after baselines. Preflight expanded archives/decoded media before allocation; a post-render check is not a hard memory limit.

Low-memory profile starts at half envelope (768 MiB), no warm slot, one heavy job; normal uses table; high-memory may expand only with measured headroom. Native memory/pressure probing and a user profile override are planned. `deviceMemory`/`hardwareConcurrency` are hints, not exact desktop capacity; use conservative fallback.

| Active studio | Initial soft target, inside active bucket | Strategy |
| --- | --- | --- |
| Code | 128 MiB | Virtualize tree/decorations; only visible preview; avoid duplicate source trees |
| Documents | 256 MiB | Visible/near page layout; current/history state outside component |
| Sheets | 256 MiB | Visible cells, bounded recalculation batches |
| Slides | 256 MiB | Current/next slide, thumbnail LRU; reconcile existing guard with preflight |
| Design / Vector | 256 MiB each | Visible artboards, bounded geometry/scene/undo caches |
| Photos | 512 MiB | Tiles/proxy preview; full-resolution export separate reservation |
| Sound | 512 MiB | Chunk/stream where supported, multi-resolution peaks; separate playback lease |
| Video | 512 MiB | Bounded decoded-frame ring, filmstrip queue; export reservation |
| Vibe Space | 128 MiB UI | Virtualized jobs/logs; local model RAM/VRAM separately reported |

Targets are not additive across dormant studios. Large-file mode requires combined admission and bounded processing. Candidate GPU allowance: active 128 MiB estimated textures, warm 16 MiB, suspended zero view-owned textures; count measurable bytes within studio tracked resources. Validate DPR, dimensions/device limits, drivers and integrated GPUs. Dimension estimates do not prove residency.

CPU proposal: active input/render first, target <=8 ms application frame work p95 within 16.7 ms at 60 Hz on supported fixtures. Report actual refresh rate. Warm/suspended have no continuous render/speculative compute. Protect saving and real-time audio. Start with one heavy background job low-memory, two normal, also limited by headroom/cores. Yield main-thread batches initially <=8 ms. Synchronous WASM may not cancel mid-call: chunk or restart only reconstructible work; do not promise preemption.

## 6. Lazy loading and startup

Keep routing/format claims/command titles available as cheap metadata. Load canvas, inspector and panel implementations on activation via allowlisted factories; no arbitrary manifest import paths. Audit static re-exports and the production bundle graph: adding `lazy()` alone is insufficient.

- Spawn workers/load WASM only for admitted operations; deduplicate initialization and cap startup concurrency.
- Cache compiled modules where the actual runtime supports it; historical Figma results [S4] are not a current cache guarantee.
- Put large replaceable WASM allocations in worker lifetimes. Freeing engine objects does not promise smaller linear memory or immediate RSS reduction [S12]. Measure after settling.
- `Worker.terminate()` is immediate, with no cleanup opportunity [S10]. Verify checkpoints and finish writes before terminating.
- Imported JS modules remain cached with no manual cache clearing [S11]. Do not use unique query strings to simulate unload and leak definitions.
- Transfer large buffers deliberately: never detach the sole editable/recovery copy. Bound IPC size/frequency and batch viewport/change messages [S7].
- Boot responsive shell and last-session descriptors first; restore selected document before others. No eager reopening/decode of all tabs, model initialization or thumbnail sweep.
- Prefetch at most one likely next host during idle/headroom; stop under interaction, battery or memory pressure.

## 7. Background jobs

| Priority | Work | Policy |
| --- | --- | --- |
| P0 integrity / real-time | Atomic save completion, recovery commit, recording/playback | Reserved short bounded capacity; not behind bulk queues |
| P1 interactive | Input, visible render, activation | Protected latency; cancel superseded requests |
| P2 user-requested | Export, AI generation, full render, build/deploy | Independent job lease; continue after view switch with global progress/cancel |
| P3 maintenance | Thumbnails, indexing, lint refresh, prefetch | Pause under interaction/pressure; stale output dropped |

Job records include ID, document/revision, priority, estimate/reservation, dependencies, pin reasons, progress and cancellation/checkpoint capability. Bound queue length/log/token output. Use aging/fairness so continuous input does not starve P2 forever. Native thread priorities alone do not implement this scheduler.

Exports read immutable revision/copy-on-write snapshot, not whichever document is active later. AI streams belong to jobs, not panels; backpressure output. Local model/server RAM/VRAM is separately admitted/reported; do not kill shared Ollama/server merely because a panel closes. Vibe Space builds/processes/terminals need explicit durable job ownership and cancellation, not orphaning.

Serialize GPU export work if concurrent load breaks interaction SLOs; use proxy previews. Collaboration/file watchers are shared services: coalesce updates and defer offscreen layout while maintaining required synchronization. Closing a view does not cancel a job; document-close/quit must identify outstanding exports/writes rather than silently abandon them.

## 8. Panels and extensions

Panel lifetime follows actual visibility. Keep small UI state, unsubscribe on hide, cancel abandoned requests, virtualize logs/lists and lazy-mount heavy content. Global Agent/Jobs/Problems remain separate bounded consumers.

Add versioned extension activation by command, format, visible panel or supported workspace job; optional `onSuspend`, serializable state and `onResume`. Preserve existing checked API, scheme/CSP sandbox and timeout termination. No new ambient filesystem/network authority on resume.

Legacy extensions stay pinned while necessary; restart only after no command or indispensable unsaved state remains. Hidden iframe panels need state capture and real disposal/recreation, not CSS hiding advertised as sleep. A hung/high-message-rate extension can terminate with diagnosis. Strict per-worker RAM attribution remains unverified; use host-side rate/output quotas and job admission, not trusted self-reported bytes.

Figma's plugin article shows isolation/copying tradeoffs and explicitly records a later sandbox change [S13]. Do not copy its historical Realms design or run untrusted plugins on the main thread to avoid copying.

## 9. WebView suspension and platform limits

Default: app-owned resource lifecycle in the shared shell. Browser visibility/freeze events supplement recovery, not studio switching.

Optional Windows experiment: WebView2 `TrySuspendAsync` requires invisible controller, is best-effort, may return false and waits for running script to finish; visibility resumes it [S8]. Low memory target is advisory [S7]. Verify equivalent native COM interfaces, locked Tauri/wry/WebView2 bindings, thread requirements and Runtime versions. .NET docs establish behavior, not a callable Rust method.

Never suspend visible shell for an inactive studio. Separate hidden preview WebViews may suspend only without protected jobs/transports. Whole-app background suspension requires native/job service ownership or safe quiescence; do not assume workers, streams, collaboration or timers continue.

Tauri uses WebView2 on Windows, WebKit on macOS/Linux [S9]. `with_webview` exposes platform-specific access [S14], not portable suspension. macOS/Linux equivalence and savings remain unverified. Failure is non-fatal: explicit app-level disposal remains fallback. Do not add one WebView per studio merely for this API.

## 10. Measurement and CI

### Instrumentation, local by default

Bounded ring buffer, explicit diagnostic export. Monotonic timing marks: process launch, usable shell, activation, worker/WASM ready, first usable frame, snapshot commit, resume. Track generations, state transitions, estimated exclusive bytes, known buffers/WASM memory, worker/decoder/surface/timer counts, queue size, cache hits and pin reasons.

Native diagnostics add process-tree CPU/private memory/working set with PID ownership and deduplication; GPU/ETW where available [S7]. JS `performance.memory` and cross-origin memory APIs are optional, not portable gates. External model processes are separately labeled. No paths, document names/content, prompts, keys or credentials in automatic telemetry. Remote reporting requires separate opt-in; exports show what will be shared.

### Initial candidate SLOs, calibrated in phase 0

| Metric | Target | Definition |
| --- | --- | --- |
| Warm switch | p95 <=100 ms | Request to correct interactive frame, not pill highlight |
| Suspended resume | p95 <=500 ms small / <=1.5 s medium | Restore + worker/layout + verified ready; large fixtures have separate envelope |
| Cold activation | p95 <=1 s small / <=3 s medium | Host and engine initialization, recorded cache state |
| Usable native startup | p95 <=2 s warm / <=4 s cold | Launch to responsive shell; last-file readiness separate |
| Input during export | p95 <=50 ms | Repeatable edit to correct visible frame under admitted P2 work |
| Frame work | p95 <=8 ms app work, target 60 Hz | JS/layout/GPU/total and dropped frames separately |
| Idle CPU, no jobs | <1% of one logical core over 60 s | State normalized one-core units and OS definition; diagnose runtime floor |
| Suspended ownership | Zero view-owned workers/decoders/surfaces/timers | Itemize shared/job-leased exclusions |
| Leak sequence | No monotonic retained-resource growth; <=5% process-memory drift after settling | Fifty A/B switches, repeated trials; counts deterministic, RSS noisy |
| Correctness | Zero lost accepted edits/dirty/history regressions | Exact bytes/model + undo/redo, selection and recovery |

Targets are proposals, not results. Revise openly if representative hardware cannot meet them; no silent threshold changes to pass releases.

Fixtures: existing 1,000-file folder; small/medium/large DOCX/XLSX formulas/PPTX; high-resolution raster, large SVG/artboards, long audio, multi-clip video; ten mixed tabs and dirty sessions. Record hashes/licensing and expanded bytes, layers, cells and durations. Test empty/cold launch, session restore, all-studio sweep, edit-switch-resume-undo-save, export+editing, AI+scroll, low-memory admission, worker crash, disk-full/quota, corrupt/migrated snapshot, external/collaborative edits, IME, extension hang and playback/recording/presentation.

Hardware matrix to arrange: Windows 8 GiB integrated GPU, Windows 16 GiB reference, macOS Apple Silicon, Linux WebKitGTK. Record OS/runtime/driver/build/power state. Run with/without jobs/extensions; publish p50/p95/p99, trial count, resource estimates and native totals. No single average FPS or unsupported universal speedup claim.

CI rollout:

1. PR deterministic tests: leases, dirty/history retention, snapshot failure, stale replies, queue limits, zero suspended ownership; production bundle graph ensures inactive studios absent from eager startup paths.
2. PR browser timings: fixed fixtures, warm-up, repeated trials, same runner baseline. Candidate >10% warning, >20% block only with absolute floor/reproduction and measured noise. Calibrate before blocking.
3. Native nightly/pre-release: fixed-device startup/process/GPU tests. Playwright browser pass is not WebView2/WebKit certification.
4. Artifacts: baseline SHA, fixture hash, hardware/runtime and scenario deltas; no private project data. Aggregate improvement cannot hide studio regressions.

Figma reports a 20% VM margin plus targeted hardware [S3], not a universal CI threshold. Somnia needs its own variance study.

## 11. Phases and effort

Engineering person-days, not delivery dates. Assume engines support lossless current-state/history export; exclude hardware procurement/CI waiting. Parallelism reduces elapsed time only where dependencies allow.

| Phase | Work | Estimate | Exit criterion |
| --- | --- | --- | --- |
| 0 | Ownership inventory, Documents/Sheets retention audit, bundle/native baselines, local instrumentation | 3-5 days | Reproducible baseline and unsaved-state invariants |
| 1 | Independent sessions/history, snapshot contract, allowlisted lazy hosts/panels, init deduplication | 6-10 days | Edit-switch-resume-save/undo correct; eager graph clean |
| 2 | Coordinator/leases, warm/suspend/evict pilot; candidate Slides, then Documents/Sheets after safety refactor | 5-8 days | Verified recovery, stable fifty-switch resources, checkpoint failure pins safely |
| 3 | All suite adapters; scheduler/admission, decode/cache/IPC bounds, profiles | 10-16 days | Mixed studios + export/AI stay within calibrated gates; real-time work protected |
| 4 | Extension SDK lifecycle, hidden panels, optional Windows experiment, WebKit fallback, native CI/privacy | 6-10 days | Compatibility/security preserved and native release gates pass |

Initial total: **30-49 engineering person-days**. Longer if history serialization or media chunking needs engine changes. Session correctness precedes aggressive RAM reduction. Roll out per-studio flags; stop on recovery mismatch/lost dirty state. Fallback to conservative pinned/warm behavior, disable speculative loading/eviction independently, retain recovery through rollback/migration.

## 12. Risks and open decisions

| Risk | Required mitigation |
| --- | --- |
| Unmount destroys edits/history | Session ownership first; exact switch/recovery tests |
| Snapshot costs exceed savings | Incremental journals, reserved peak bytes, bounded one-at-a-time serialization |
| Many dirty sessions cannot fit | Verified durable spill; queue/refuse heavy work with save/close choices, never discard |
| Cold-resume churn | Warm hysteresis, valid preview, measured return patterns |
| Singleton engine serves many sessions/jobs | Dependency leases and revision identity before disposal |
| WASM/codec monopolizes CPU | Chunk/reduce concurrency; safe restart or later process isolation |
| Native/GPU attribution inaccurate | Estimate coverage and process totals separately; device profiling |
| WebView sleep stops essential services | Never per-studio shell suspend; native ownership or safe quiescence |
| Legacy extension state/security regressions | Versioned SDK, pin/restart path, fail-closed capabilities and host quotas |
| External/collab updates conflict | Fingerprint/revision checks, no blind snapshot replacement |
| Storage/corruption/migration failure | Checksums, atomic verified writes, tested migrations, retained fallback |
| CI noise masks regressions | Deterministic resource gates + repeated calibrated native timings |

Phase-0 open choices: minimum performance hardware/profile; exact state/history export support per engine; native memory/pressure probes; runtime auxiliary WebViews; hidden-app playback policy; recovery retention/encryption; external model visibility; achievable SLOs and baseline noise.

## 13. Roadmap delta

Add cross-cutting **Performance and Resource Architecture** track: baseline/retention audit, session-safe lazy hosts, lifecycle pilot, global resource/job admission, suite adapters, extension/native release gates. Planned, not shipped. This concept change includes no development, issue creation, release or push.

## Sources

Searched and fetched 2026-10-13. Coverage includes official product docs, vendor engineering case studies and platform/API references. Independent Somnia benchmarks were not available in this research. Historical/vendor results do not guarantee Somnia performance. Code audit is separate primary evidence pinned above.

- **S1** Microsoft, VS Code Extension Host: hosts and lazy activation. https://code.visualstudio.com/api/advanced-topics/extension-host
- **S2** Microsoft, Activation Events: event-driven activation. https://code.visualstudio.com/api/references/activation-events
- **S3** Figma, Keeping Figma fast, 2023-08-29: VM/device test strategy. https://www.figma.com/blog/keeping-figma-fast/
- **S4** Figma, WASM startup case study, 2017-06-08: historical only; old browser bugs/status not current guidance. https://www.figma.com/blog/webassembly-cut-figmas-load-time-by-3x/
- **S5** Google, Page Lifecycle API: freeze/discard/recovery. https://developer.chrome.com/docs/web-platform/page-lifecycle-api
- **S6** Google, Memory/Energy Saver: discard/reload and proactive persistence. https://developer.chrome.com/blog/memory-and-energy-saver-mode
- **S7** Microsoft, WebView2 performance: advisory memory, IPC, native profiling. https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance
- **S8** Microsoft, TrySuspendAsync: invisible/best-effort/auto-resume; .NET documentation, native bindings unverified. https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.trysuspendasync?view=webview2-dotnet-1.0.4191.47
- **S9** Tauri, Webview Versions: platform engines. https://v2.tauri.app/reference/webview-versions/
- **S10** MDN, Worker.terminate(): immediate without cleanup. https://developer.mozilla.org/en-US/docs/Web/API/Worker/terminate
- **S11** MDN, import(): module caching cannot be manually cleared. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import
- **S12** MDN, Memory.grow(): linear-memory growth/buffer behavior. https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/Memory/grow
- **S13** Figma, plugin sandbox history: isolation/copy costs, later implementation change. https://www.figma.com/blog/how-we-built-the-figma-plugin-system/
- **S14** Tauri Rust Webview API: platform-specific native access; live docs do not prove locked dependency support. https://docs.rs/tauri/latest/tauri/webview/struct.Webview.html
