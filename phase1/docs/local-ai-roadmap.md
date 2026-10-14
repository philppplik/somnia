# Local AI roadmap: real paths vs contracts

2026-10-14, AH-AU source audit. 'Wired' means application code calls the path,
not packaged/native E2E certification. Pure tests prove bounded helpers, not a
working feature. No end-to-end local RAG exists yet.

## Status

| Slice | What is real | What is still contract-only or unverified |
| --- | --- | --- |
| AH Office | Pure bounded Office prompt helper; existing Slides canonical proposal path predates AH | No new Office UI/provider wiring. Documents/Sheets adapter:null; range extraction/accept/undo pending |
| AI Interface/Animation/3D | Pure bounded design prompt helper; existing studio adapters audited | No new studio UI wiring or native editing proof from this slice |
| AJ manager polish | Pull byte-progress rejection and consistent saved task/studio choice checks | No new download transport or quality/readiness certification |
| AK streaming safety | Existing provider timeout/abort completion checks hardened | Shared daemon stop/unload and native cancellation not proven |
| AL search | Pure UTF-8 chunks and cosine ranking | No embedding call, source acquisition, index or search UI |
| AM Office handoff | Frozen revision/selection/target review DTO and drift tests | Builders do not call it yet; no transaction mapping/accept/undo |
| AN push-to-talk | Pure lifecycle/transcript bounds and tests | Not wired. Existing preview is optional/default-off; no reviewed helper releases registered |
| AO model candidates | Pure explicit RAM/VRAM task ranking; embed candidate labelled pending | No UI/download/selection; model quality and embedding adapter untested |
| AP data flow | Single audited data-flow doc and provider endpoint regression | Not packet attestation; daemon/proxy egress and packaged assets remain unproven |
| AQ context report | Guard and inspectable numeric report share existing byte accounting | Not a tokenizer, model capacity or multimodal guarantee |
| AR budget UI | Local Agent disclosure consumes last prepared request report; five locales/fixture pixels | Not current-draft preflight. Early pre-provider refusals stay Unknown; no full desktop E2E |
| AS index lifecycle | Pure generation/descriptor/drift/cancel authority checks | No vectors, storage, atomic source capture or real request cancellation |
| AT text hashing | Pure explicit NFC/newline/chunks + local existing SHA-256; pipeline/content revisions | No real source picker or embedding pipeline. Web Crypto required, no weak fallback |
| AU retrieval | Frozen in-memory vectors, AL cosine/top-k reused, AS ready/fresh checks | No vector generation or actual source-to-vector provenance proof; no RAG UI/answer provider |

The separate AgentSettings repair is test-only: isolated Node storage and exact
three-select contract. It is not a new feature.

Existing Ollama chat/provider/manager paths are wired, with local weight/capability
checks, source controls, explicit review and cloud consent boundaries. Downloads and
external docs links are still network operations. Local means no app-directed cloud
inference upload in those verified paths, not proof that a user daemon never proxies.
See [Local AI data flow](local-ai-data-flow.md).

## What blocks working local RAG

1. No selected embedding model configured/verified and no /api/embed adapter.
   embeddinggemma:300m is only a vendor-sourced candidate, not an approved default,
   installed digest, license sign-off, quality result or adapter. Runtime >=0.11.10
   is its vendor floor, not measured compatibility here.
2. No explicit source picker/extractor or atomic revision/hash-to-vector builder.
   Sources must be selected, not crawled. Hashing selected secret prose doesn't
   sanitize it. Empty source policy, source/range limits and exclusions need UX.
3. No complete orchestration: capture -> hash/chunk -> verify embed model ->
   bounded embed/cancel -> fresh hash/model check -> publish ready vectors. AS/AT/AU
   describe pieces; descriptor equality alone cannot prove content/vector provenance.
4. No live query embedding bound to the same model/digest/dimensions and query
   generation. Late/cancelled query results must never enter a newer query.
5. No retrieval display/citations/source opening, or explicit action to add reviewed
   snippets to local chat. Similarity isn't truth. Answer model/output review/source
   consent must remain separate; no silent cloud fallback or auto-apply.
6. No storage choice/implementation and no real model/device/package acceptance
   evidence. Source changed during build, model swapped, corrupt vectors, cancel,
   empty/oversized input, and no-network behavior need integration tests.

## Ordered decisions for Philipp

These are choices to request, not approvals already given.

1. First outcome: search-only ranked source snippets, or a local answer with cited
   snippets? Suggested first milestone: search-only, which avoids premature answer
   synthesis and makes retrieval quality visible.
2. Embedding model: review/test embeddinggemma:300m, or choose another exact local
   model? Before download/use, review license, size/network/model volume, Ollama
   version and installed digest/capability. No download permission implied.
3. Source scope: start with explicitly selected open text documents only, or also
   displayed Sheets cells/canonical Slides runs? Never silently expand to folders,
   hidden cells, history or credentials. Suggested first scope: open text selection.
4. Storage: session-only memory discarded on close, or an explicitly saved local
   index? Suggested first milestone: memory-only. Persistent index needs separate
   retention/location/delete/export policy, encrypted-at-rest decision and migrations;
   content hashes aren't encryption and local isn't automatically confidential.
5. If cited answers are wanted: choose an exact local answer model and whether
   reviewed snippets may be included per query. No cloud provider/fallback in the
   proposed first RAG milestone. Existing general-chat cloud consent isn't approval
   for automatic RAG source disclosure.

## After those decisions

Freeze one thin end-to-end scope, implement the embedding adapter and atomic build/
query orchestration against existing contracts, then wire the source picker and
retrieval review UI. Do not add more isolated contracts in place of that work.
Validate with exact installed models on target machines, adverse/cancel/drift tests,
fixture screenshots/accessibility, and native/packaged CI before claiming shipped.
Only then consider persistent indexes or answers. Keep $0 work and no new
production dependencies unless separately approved/reported.

## Evidence boundary

Latest AU broad Agent/provider suite: 501 tests passed. AR component fixture covered
five locales/light/dark/German narrow pixels; none of this is native/full desktop
E2E or real embedding/retrieval quality. Unfiltered typecheck remains blocked by
missing generated slides-engine/pkg/somnia_slides.js; no bridge stubs fabricated.
Native/Rust/WASM/full app E2E remain CI-only. Fresh origin/int/beta5 at this audit
still 2b365863; this document follows the incremental AH-AU patch chain.

Sources: phase1/src/lib/agent/{officeLocalPrompt,designLocalPrompt,localModelManager,
localSearch,officeReviewContract,pushToTalk,localModelRanking,
localContext,localContextReport,localContextBudgetStore,localIndexLifecycle,
localIndexChunks,localRetrieval}.ts; AgentPanel.tsx/LocalContextBudget.tsx;
voice-releases.json ([]), voiceInput.ts/nativeVoice.ts; preceding slice concepts.
