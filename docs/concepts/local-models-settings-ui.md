# Local models: Settings > AI > Local

Status: proposed concept, not implemented. Date: 2026-10-14.
Baseline: live `int/shell`, `315d1f23a061d07215bdc60d25d3d57d756cbaab`.
Scope: installed models, catalog/hardware advice, download UI, assignments, health
and studio defaults. Engine packaging/process ownership and the full design system
belong to other slices. All new components/contracts below are proposals.

## 1. Product contract

Find an installed model, understand what it can actually do in Somnia, download
an appropriate variant and assign tasks without a terminal. Stay in the global
Settings shell; no extra studio, rail or main-workspace status widget.

Keep separate: Installed, Local verified, Advertised capability, Somnia adapter
compatible, Task tested, Loaded in memory, Assigned. None implies all the others.
Downloading uses the network; local inference is a separate promise. Local
verification trusts the daemon, not a hostile proxy pretending to be one.
Cloud-backed aliases on loopback never qualify for Local-only assignments.

## 2. Current-source integration map

All paths are relative to `phase1/` at the pinned baseline.

| Path | Observed behavior | Proposed extension |
| --- | --- | --- |
| `src/components/Settings.tsx` | Hosts global `AgentSettings` | Keep existing host/navigation |
| `src/components/agent/AgentSettings.tsx` | Providers/Instructions/Privacy/Tools, model input/datalist | Add Local; link from Providers, no duplicate manager |
| `src/store/appStore.ts` | Four-value `settingsAITab` union | Add `local`, safe unknown-value fallback |
| `src/lib/agent/modelCatalog.ts` | Reduces Ollama inventory to id/name | New rich inventory view model, preserve legacy list |
| `src/lib/agent/providers/ollama.ts` | version/tags/show, fail-closed local check, text/tool chat | Reuse gates; manager owns additional APIs |
| `src/lib/agent/settings.ts` | Non-secret provider/model/custom prompts | Versioned routing migration |
| `src/lib/agent/settingsRuntime.ts` | Shared saved config; blocks save while running/review pending | Same transaction rules for assignments |
| `src-tauri/src/agent_settings.rs` | Persisted preferences deny unknown fields | Coordinate native/frontend schema migration |
| `src/lib/studios/registry.ts` | Runtime registered studios, string IDs, agent/agentV2 | Enumerate registered studios, including extensions |
| `src/lib/shell/studioContext.ts` | Host-owned live context | Snapshot identity at request creation |
| `src/components/ui/{tabs,button,input,badge,dialog}.tsx` | Shared primitives | Reuse, no second kit |
| `src/styles/{tokens,global,agent}.css` | Theme/radius tokens plus legacy AI selectors | Scoped UI, remove conflicts only after regression checks |

Inspection found the AI keyboard handler uses modulo 3 despite four tabs. Adding
Local must use `tabs.length` through tested shared Tabs behavior. This was not
reproduced in a browser. The inspected Ollama message conversion has text/tools,
not image/audio payloads. Sound context is metadata/settings; Photos describes
settings/dimensions without pixels. A capable model does not enable these inputs.
The historical shell concept's older baseline is not current-source evidence.

## 3. Information architecture and reusable UI

AI: `Providers | Local | Instructions | Privacy | Tools`.
Local: `Installed | Discover | Assignments`, sharing a short runtime header.
Settings search includes localized model/voice/vision/tools/GPU/RAM/download aliases
and registered studio names. Deep links select studio/task within Assignments
without switching the active workspace studio.

Text layout only, not pixel-verified:

```text
Settings sidebar | AI tabs: Providers [Local] Instructions Privacy Tools
                 | Local models                         [Refresh]
                 | Ollama / This computer / Reachable / checked time
                 | Downloads need network; local runs are checked separately.
                 | [Installed] Discover Assignments
                 | Search...                         Capability filter
                 | Exact variant | capability evidence | bytes | state
                 | Details / Test / Assign / More
                 | Download job: phase, current layer bytes, Cancel
```

One body scroll owner. Stack rows/header at narrow widths; cards in Discover are
compact, not marketing tiles. Assignments is a vertical form with expandable
studio overrides. Use semantic surface/text/border/accent/warning/danger tokens,
`--r-panel`, `--r-control`, `--r-sm`, density, contrast and reduced motion. No raw
light-theme colors or 25px radius on every small control.

Domain composites: RuntimeStatusRow, ModelListItem, CapabilityBadge,
HardwareFitNotice, DownloadJobRow, AssignmentField, StudioOverrideSection.
Proposed generic gaps: accessible progress and select/combobox primitives. Confirm
ownership with the design-system slice. Scope new styles so legacy broad AI form
selectors do not override shared components.

## 4. Installed models and evidence

Rows show exact model/tag, runtime, reported storage bytes, parameter size and
quantization when reported, capability evidence and independent locality/residency.
Unknown is not zero. Search IDs/names; assigned-first then name default sorting.
Remote/unverified entries remain visible with reasons and disabled Local assignment.
Empty inventory and failed inventory fetch must not have the same empty screen.

Tags supplies inventory, not complete capabilities. Show metadata is loaded lazily
for visible/selected/assigned rows in a bounded queue (proposed maximum two).
Cache by endpoint identity/digest/runtime version; invalidate after mutation.
Unknown capability metadata stays Unknown, not unsupported; never parse model-name
fragments as capability proof. Stale data is readable with Last checked time but
cannot authorize inference, assignment validation or destructive operations.

Details: full tag/digest, evidence source, storage, architecture/quantization,
license/source link, model context limit if known, requested/effective context
separately, reported loaded memory, assignments and task-specific test results.
Row selection causes no inference, preload, download or external navigation.

Actions:
- Test uses synthetic fixtures with Stop; no open document/image/microphone by default.
- Assign changes a draft field and navigates there, never silently saves.
- Free memory requires adapter support, no Somnia-active request, and warning
  about other clients; Somnia idle does not prove daemon-wide exclusive ownership.
- Remove confirms exact model/all saved usages, revalidates, blocks active use.
  Offer replacement draft first or explicit unresolved references. No cloud fallback.
  Shared blobs mean model size is not promised reclaimed disk space.

## 5. Curated catalog and hardware advice

Bundle a small reviewed/versioned catalog. Refresh catalog is an explicit network
action separate from local inventory refresh; failure retains older bundled data
with its date. Model cards are data, never instructions or executable HTML/commands.
Custom models remain available in Installed without automatic catalog promotion.

Catalog entry: entryId, runtime/tag, optional reviewed digest, publisher/source
URLs, license identifier/link, reviewedAt/catalogVersion, task/input modalities,
adapter support, quantization, estimated download bytes, benchmark conditions,
recommendation confidence and retirement reason. Validate/bound the manifest.
No arbitrary catalog-provided executable endpoint, script or tool permission.

Research candidates, not performance-certified recommendations:

| Variant | Proposed catalog use | Limitation |
| --- | --- | --- |
| `qwen3:1.7b` | Small text candidate | Device latency/quality untested |
| `qwen3:4b`, `qwen3:8b` | Text/tools candidates | Advertised family tool support needs per-variant show/test |
| `qwen2.5-coder:7b` | Code-specific text | Code marketing does not certify function calling |
| `gemma3:4b` | Text/image candidate | Somnia image transport still needed |

Fetched Qwen3 family sizes were about 1.4/2.5/5.2 GB; coder variant 4.7 GB.
These are dated vendor catalog observations, not runtime memory or final download
totals. Tags can change; reconcile digest and invalidate old tests. Never use
Latest automatically, claim Best, update/pull without a user action or infer voice
from a text model. Speech candidates/engines belong to the engine/catalog slice.

Hardware snapshot: OS/architecture, total/available RAM, GPU/backend, trustworthy
VRAM, unified-memory flag, free storage on actual model volume, timestamp/errors.
Never add unified memory twice or combine discrete VRAM as one imaginary GPU.
Browser preview says Hardware unavailable; manual figures are User supplied and
cannot establish runtime readiness. Unknown model volume means Storage not checked.

Ranking: exclude cloud/incompatible backend or adapter; match task/modalities;
check storage; prefer measured fit at exact quantization/context/concurrency;
otherwise expose conservative memory range, not a false green guarantee. Include
weights, KV cache, runtime overhead, OS/headroom and other loaded models. CPU/offload
is a separate slower choice. Rank by studio task, fit confidence/quality, then size.
Show one primary candidate plus alternatives, no automatic selection/download.

Fit labels: Tested on similar hardware, Estimated fit, May need CPU/offload,
Insufficient estimated memory, Hardware unknown. Reserve percentages/minimum
hardware require benchmarks, not invented 8/16/32 GB promises. Advanced shows
context/concurrency; do not silently choose maximum context. Current FAQ says 4096
by default while context-length docs describe VRAM-dependent defaults. Resolve
through requested/effective runtime values, never a fixed cross-version assumption.

## 6. Downloads and honest completion

Confirm exact variant/source/license, estimated bytes, known free storage or Not
checked, and network use. Low known storage blocks; unknown storage requires review.
No document data is involved. A manager outside Settings owns jobs; close/reopen
reattaches, not cancels or duplicates. Proposed one active pull per runtime with
queue; no silent global daemon parallelism/environment changes.

Phases: queued -> preparing -> downloading -> verifying -> installing ->
reconciling -> complete. Also failed, interrupted and cancel-requested with
cancelled/still-active/unknown outcomes. Store job intent, not imaginary daemon IDs.

Pull returns per-layer digest/total/completed. Deduplicate layer updates. Show
current-layer bytes; overall percentage remains indeterminate until complete totals
are known through a validated adapter/manifest. A layer at 100% is not install done.
Verification has its own phase; omit unreliable ETA. Catalog size is an estimate.
Complete requires terminal success plus fresh inventory/show/local verification.
Disconnect after final bytes is Reconciling; stale jobs cannot overwrite newer digests.

Cancel stops owned transport and asks the manager to stop its job where supported.
Aborting a reader is not proof the daemon stopped, particularly with shared pulls.
Expose certainty. Official docs describe resumable cancelled pulls; offer Retry,
not guaranteed Pause/Resume until adapter behavior is proven. Reconcile before retry;
recheck changed tag/source. Never remove shared partial blobs as cleanup or
redownload automatically after restart. Errors distinguish disk, registry/tag,
integrity, permissions, network, daemon loss, unsupported API and malformed stream.
Diagnostics redact tokens/private paths/user data before explicit export.

## 7. Tasks, assignments and atomic settings

| UI group | Slot | Eligibility |
| --- | --- | --- |
| Text | text | Completion/chat transport |
| Voice: Speech input | speechInput | Audio ingestion/transcription adapter |
| Voice: Speech output | speechOutput | Synthesis/playback adapter |
| Vision | vision | Image ingestion/text answer, not image generation |
| Tools | tools | Function-call output, schema validation and approval broker |

Tools routing grants no execution rights; the same model may serve Text/Tools.
Sound is not proof of speech support. Embeddings/audio reasoning/translation are
future explicit tasks, not hidden aliases. Unimplemented adapters show a reason,
not an enabled picker. Model assignments never broaden data access permissions.

Device defaults offer Unassigned or eligible model. Studio rows offer Inherit,
Override or Disable, showing effective model/origin. Disable never falls through.
Proposed non-secret schema, to coordinate with runtime/native persistence:

```ts
type TaskSlot = 'text'|'speechInput'|'speechOutput'|'vision'|'tools';
type ModelRef = {runtimeId:string;model:string;reviewedDigest?:string};
type GlobalChoice = {mode:'disabled'}|{mode:'model';ref:ModelRef};
type StudioChoice = {mode:'inherit'}|GlobalChoice;
interface LocalRoutingPreferences {
  version:1;
  defaults:Partial<Record<TaskSlot,GlobalChoice>>;
  studios:Record<string,Partial<Record<TaskSlot,StudioChoice>>>;
}
```

Absent global value means Unassigned, absent studio value means Inherit. Preserve
unavailable extension overrides for repair; registry changes never seed downloads.
Resolution: explicitly approved request choice, studio override, device default.
Each still passes eligibility/permission. Disabled/missing/stale/incompatible choice
returns actionable unavailable; never first-installed, cross-modality or cloud fallback.

At request creation snapshot studio/task/model/digest/settingsRevision/contextRevision
from host context; studio switching cannot retarget active work. Changes remain
drafts, saved in one validated transaction. Keep running/review/auth/save guards;
active tests guard affected models. Failure preserves current routing and draft.
No queued auto-save when a run ends. Native/frontend migration lands together.
Legacy Ollama choice seeds Text only after local verification, not Tools. Failing
legacy references stay Needs attention. Cloud configuration/custom prompts/secrets/
privacy remain intact. Saving Local defaults must not silently switch existing
provider workflows; request entry points and broader routing precedence need a
cross-slice decision before implementation.

## 8. Studio-aware defaults without false capability claims

Enumerate registered IDs/labels, not a hard-coded list or filename guessing here.
Suggested task rows are recommendations, not auto-assignment/tool grants.

| Studio | Suggested tasks | Boundary |
| --- | --- | --- |
| Code | Text/source; Tools/reviewed actions | Code specialization is not function-call proof |
| Documents | Text; optional Vision/pages | Render/input pipeline is separate |
| Sheets | Text/formulas; supported Tools | No automatic whole-workbook access |
| Slides | Text/headings; optional Vision/render | Explicit image input permission |
| Design/Vector | Text/layout/SVG; optional Vision | Vision does not edit vector nodes |
| Photos | Text/settings; Vision/image analysis | Baseline context has no pixels |
| Sound | Text/metadata; supported speech slots | Baseline context has no audio bytes |
| Video | Text/timeline; optional Vision/frames | Image model is not a video-stream model |
| Vibe Space | Text/Tools per task | Do not overwrite agent-board worker choices |
| Extensions | Host-validated declared needs | Unknown studio/capability stays safe |

Scope picker edits routing only, not workspace. Effective model can appear inside
existing agent panel, not new global chrome.

## 9. Health, access and tests

Runtime: Not checked/Checking/Reachable/Unreachable/Unsupported version.
Model: Present/Missing/Local unverified/Remote-backed. Residency: Not loaded/Loaded/
Unknown. Active request is separate. Test: Not tested/Testing/Passed/Failed/Cancelled/
Outdated, scoped to digest/task/backend/adapter version/time/test conditions.

Refresh on entry/user action/mutation events. Proposed low-cost local version/ps
recheck at most every 30 seconds only while visible; stop hidden. Prefer manager
events, fetch tags/show on invalidation, guard cancellation and request generations.
No automatic periodic inference, online catalog request or microphone access.
Synthetic tool test validates function call but executes no real tool; vision uses
bundled non-private image; speech bundled sample or explicit record permission.
Version returning 200 does not mean Native ready or good task quality.

Shared keyboard tabs/comboboxes, labeled controls, visible focus, Esc/return-focus,
model-specific action names, text with status colors. Labeled progressbar only when
determinate; phase announcements rather than byte spam. Keep focus across refresh.
Cancelled refresh is not an error. Locale keys land across all shipped languages.

Delivery: read-only Local first; schema/migration/resolver; catalog/hardware;
manager/downloads; then task adapters/tests. Never enable unsupported downloads or
voice/vision controls just to fill the design. Preserve existing tests; add cases:

- Fifth-tab keyboard reaches/wraps all tabs using actual length.
- Empty, unreachable, malformed, remote aliases and stale metadata stay distinct.
- Missing capability is Unknown; text-only cannot satisfy vision/tools/voice.
- Layer progress/repeat updates/unknown totals cannot fake completion.
- Cancel/disconnect/restart/shared pull preserve uncertainty and safe reconciliation.
- Hardware unknown/unified memory/context/concurrency cannot yield false fit.
- Browser/native migration preserves secrets/privacy and last valid preferences.
- Inherit/Override/Disable, extension loss, model removal/digest change resolve safely.
- Running/review gates, draft failure, studio switch and synthetic tools are safe.
- Existing provider routing does not silently change.
- Rendered checks cover keyboard, screen reader, 200% text, narrow widths,
  light/dark/high contrast/themes/density/reduced motion.

No runtime/build/cargo/WASM/tests/model benchmarks or rendered UI were run here.
Native hardware/install/cancel behavior, migrations and adapter readiness remain
unverified. Open dependencies: catalog cadence, benchmark matrix, provider-routing
precedence, speech engines and native manager cancellation/ownership guarantees.

## 10. Sources and boundaries

Fetched 2026-10-14. Official API/model pages establish advertised behavior, not
Somnia compatibility/performance. Community issue is supporting evidence, not API
contract. No independent device benchmark is claimed.

- https://docs.ollama.com/api/tags - installed names/digests/sizes/details.
- https://docs.ollama.com/api-reference/show-model-details - capabilities/model metadata.
- https://docs.ollama.com/api/ps - loaded size_vram/context, not GPU capacity/busy proof.
- https://github.com/ollama/ollama/blob/main/docs/api.md - pull layer progress,
  shared/resumable cancellation, terminal success and unload semantics.
- https://docs.ollama.com/faq - memory/concurrency/keep_alive; fixed-default sentence.
- https://docs.ollama.com/context-length - context memory/VRAM-dependent defaults.
- https://ollama.com/blog/multimodal-models - image modality work, not generic speech proof.
- https://ollama.com/library/qwen3 - variants/sizes and advertised tools abilities.
- https://ollama.com/library/qwen2.5-coder:7b - code variant/size, not tools proof.
- https://ollama.com/library/gemma3:4b - text/image description, not Somnia image support.
- https://github.com/ollama/ollama/issues/10097 - capability-discovery performance
  discussion supports bounded lazy show metadata rather than eager inventory fan-out.
