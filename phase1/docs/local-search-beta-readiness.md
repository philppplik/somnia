# Local search beta-readiness wrap-up (BG, 2026-10-14)

Status: implemented incremental patch chain, fixture-tested; not a declaration of
integrated/shipped beta or actual target-device acceptance. Keep first milestone:
search-only ranked source snippets, explicitly selected visible open `.txt`/`.md`,
exact optional `embeddinggemma:300m`, memory-only. No answers/cloud fallback,
folder crawl, persistence or automatic download/indexing.

## What is implemented

- AX adapter: exact loopback model/capability/digest verification, bounded batches,
  `truncate:false`, privacy gate, timeout/owned abort and vector validation. Renderer
  fetch follows existing architecture; native/CSP transport acceptance not proven.
- AY session: raw/hash/NFC-LF chunk pipeline, selected capture before/after work,
  generations, frozen vectors, top-k cosine query, discard on stale/close. JS capture
  atomicity is not a native file/model lease or physical secure erasure.
- AZ panel: no default sources or probes, explicit Build/Query, literal snippets,
  current-source citation opening, owner/disclosure/source-change cleanup.
- BA optional exact-model size/license/network/disk review before existing pull;
  approximate 622MB/768 dimensions/vendor Ollama >=0.11.10 floor. Runtime floor is
  disclosed, not enforced/measured by the card. No legal/quality/fit sign-off.
- BB/BE/BF: keyboard Enter/Space, safe stage errors, live status, source/query UTF-8
  preflight and five-locales feedback. Bounds stay 32 sources/262144 raw bytes/256
  chunks, 4096-byte query. No silent truncation or relevance/confidence guarantee.
- BD: ordinal proved citation span for NFC-stable LF buffer, host/editor fresh raw
  checks. NFC-changing or editor-newline mismatch falls back to opening the tab,
  not a guessed highlight. BC folder proposal is design only, outside runtime scope.

## Release blockers and concrete acceptance

| Gate | Evidence still required |
| --- | --- |
| Integration/build | Integrate exact patch chain on target branch; required generated Slides bridge and native artifacts from legitimate build/CI, full unfiltered typecheck/package tests. Do not invent stubs or weaken tests/budgets. |
| Real local transport | Installed exact reviewed model on supported device/runtime; packaged renderer CSP/CORS plus tags/show/embed success. Trace selected-only requests, redirects/cloud-looking metadata rejection and no fallback. Loopback alone is not local inference proof. |
| Optional setup | Real exact-tag model-volume fresh disk/ack/pull/status/retry/cancel verification, actual final artifact size/digest/capability. Explain unsupported runtime instead of relying on disclosed minimum. No actual download done by these slices. |
| Lifecycle/races | Packaged close disclosure/panel/project and app-close abort/discard; edits/deletes/rename/model replacement during build/query, late completions and daemon cancellation ambiguity. Check ready memory not reused after owner change. |
| Citation usability | Cross-tab/open-source host behavior, repeated text and exact range, newline/NFC fallback clear to tester, source mutation before focus, no document edits from selecting. CodeMirror match outlines are not the selected citation range. |
| Retrieval usefulness | Small reviewed local text corpus with known source locations, non-English/repeated/noise queries, acceptable latency/resources and ranked snippets. Cosine isn't truth; current top-k returns nearest chunks even if none is relevant. No "no relevant evidence" claim without a separately designed threshold. |
| Accessibility/locales | Actual keyboard/focus and screen-reader speech, five locale narrow layout/long paths/errors/busy/cancel in the full shell. DOM attributes and fixture screenshots alone don't establish screen-reader behavior. |

Native/Rust/WASM and full desktop E2E run in CI, not local ad-hoc builds. Real model
use must use separately authorized, reviewed test sources; no private-user-data
inference or model purchase/download inferred from this note.

## Existing evidence, with its limits

Latest BF Agent/provider suite: 524 passed. Added fixture browser cases validate
source/query preflight no-I/O, explicit selected build/query/citation, literal HTML
inertness, safe errors, five locales, keyboard and light/dark390px pixels. BD real
SourceEditor fixture verifies repeated-source selection/focus. Synthetic embedding
responses are not model quality/native evidence. No actual model download/inference,
physical-memory erasure or packaged desktop E2E has been executed here.

DS/commands/UI inventory/layers passed; dependency analysis retains missing compiler,
87 ignored and 4 stale baseline caveats. Unfiltered tsc still reports the inherited
missing `slides-engine/pkg/somnia_slides.js`. $0, no new production dependencies.

## Next order

1. Integration/target CI and transport/setup acceptance, not more isolated contracts.
2. One reviewed real corpus smoke and packaged lifecycle/citation/a11y acceptance.
3. Fix failures in bounded slices; decide whether safe tab-only normalization
   fallback is acceptable for beta or needs a full alignment phase.

Loaded closed texts, disk folders, persistent index and generated cited answers
need new scope decisions. None is required to prove this narrow search beta.

Grounding: LocalSearchPanel/AgentPanel/SourceEditor/appStore, localEmbedding,
localSearchSession/localIndexChunks/localRetrieval, BA-BF concept notes and latest
validation reports. This supersedes AV's local-search gap list only for the
implemented items above, not AV's separate voice/Office/release concerns.

Roadmap-Delta: beta acceptance gates and next order made explicit; no new runtime,
permission, dependency or release-ready claim.
