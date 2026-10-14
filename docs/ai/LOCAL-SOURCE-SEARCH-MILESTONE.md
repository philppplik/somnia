# Local source search milestone

Status: **In development**. This is an implementation and test summary, not production acceptance or release sign-off.

The approved scope is optional `embeddinggemma:300m` setup, search-only with source citations, user-selected already-open text and a memory-only index. Generated answers, disk persistence, background discovery and cloud fallback are outside this milestone. User instructions live in the [local source search guide](../guide/local-source-search.md).

## Implemented workflow

- Global toolbar/palette entry and separate Agent search entry, same eligible open `.txt`/`.md` scope.
- Exact-parent folder selection, individual exceptions, full-scope refusal at existing limits and exact-text consent.
- Explicit runtime/hardware/review wizard and exact embedding-only download review using existing disk/ack/confirmation/progress/cancel/reconciliation gates.
- NFC/LF/codepoint preparation, original and normalized source hash/revision binding, bounded8/32 batches, verified exact model digest/local capability/privacy gate before embedding.
- Atomic ready-index commit with exact prepared chunk/ordinal/text/descriptor/vector coverage, source/model/cancel invalidation and no partial-ready fallback.
- Semantic query ranking and literal phrase retrieval, all/single/multiple ready-source candidate filters, bounded global result limits and optional inclusive cosine cutoff.
- Full semantic and phrase coverage, per-source omissions/zero matches, exact off-list best-chunk review, no fake rank or factual confidence.
- Literal context reader, returned-citation inspection, optional compact prefixes and raw-buffer editor jump requests with unsupported mapping/refusal distinctions.
- Searchable/paged installed-model actions and reviewed exact deletion identity with fresh inventory and saved-assignment checks.

## What the evidence proves

Unit tests cover bounded inputs, source/hash/descriptor identity, invalid vectors, exact batching, forged output refusal, drift, cancellation, candidate subsets, cutoff/coverage, literal evidence, offset mapping and model-action gates. Browser fixtures cover light/dark narrow layouts and the reviewed workflow. One integration fixture uses the actual LocalEmbeddingAdapter through synthetic `tags`/`show`/`embed` responses through build, query, ranking and citation callback.

The synthetic vectors deliberately make ranking deterministic. They do not measure semantic quality. A source-editor callback proves the requested target, not an actual native editor selection. An inventory digest proves returned inventory identity, not physical execution or model quality. Tests do not download a real model or process private user documents.

DS, dependency layers and command/i18n checks pass on the patch chain. The inherited generated Slides module is absent locally, so full TypeScript/native application acceptance is not claimed. Existing dependency-layer warnings remain; no budgets were raised or tests weakened. No new dependencies were added.

## Open acceptance gates

1. Apply/integrate the patches on the real branch tip and run the full required CI suite.
2. Build native/Rust/WASM/full desktop in CI and check platform CSP, runtime HTTP/native transport and cancellation behavior.
3. Review an actual optional model download and verify reconciliation, digest replacement, model-volume facts and cancel outcomes on each supported target.
4. Exercise real embedding inference with approved non-private test text. Measure quality and performance separately from metadata capability.
5. Inspect full desktop toolbar/dialog/studio layout and actual source-editor buffer selection/focus, including project change and modal setup interactions.
6. Confirm no index, query or private source is persisted, no silent cloud route exists and no generated-answer surface is enabled by this milestone.

Passing synthetic tests does not close these gates. The existing [local AI acceptance checklist](LOCAL-AI-ACCEPTANCE.md) remains the acceptance home. No Stable or Pre-release label is assigned here without a published release.

The [offline EN/DE retrieval evaluator](../search-offline-evaluation-dn.md) provides a literal baseline and hand-authored-vector plumbing metrics. It does not establish real embedding-model quality; no ranking/chunk tuning was justified by those synthetic numbers.
