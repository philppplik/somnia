# Local embeddings/search: concept and pure helpers

## Privacy and boundary

Semantic search may compare an explicit query with explicitly selected project or
document text using a user-chosen exact local embedding model. No automatic indexing,
watcher, filesystem crawl, hidden/history/credential sources, telemetry, sync or cloud
fallback. Nothing leaves the device in this helper slice: no transport exists here.
A future Ollama embedding request must use existing loopback/local-weight checks and
must not claim localhost alone proves physical local execution. A malicious/proxied
user-managed daemon remains a trust limitation, not cryptographic zero-egress proof.

Existing capability metadata recognizes embedding as a declared capability; this is
not a tested embedding adapter or quality evidence. The current Agent stream adapter
is chat, not an embeddings API. Do not silently repurpose chat as embeddings.

## Explicit workflow

User selects exact sources and reviewable scope. Host extracts bounded text only,
pins source IDs/revisions, omits binaries/URLs/formulas/credentials, and previews index
size/model. User explicitly starts embedding. Query embedding is explicit too.
Optional in-memory index never persists prompts/vectors without a separate explicit
save/export decision; revoke/delete immediately drops selected source vectors. Source
or model changes invalidate them. Cancel owns transport, not the shared daemon.

Search returns ranked snippets and exact source/revision references, never commands
or permission. Retrieved text is untrusted data. A downstream model may receive only
user-approved snippets under its normal source/provider rules. No automatic document
write, application, answer generation or disclosure follows a search result.

## First slice

Pure deterministic UTF-8 chunking accepts only explicit IDs/texts, rejects extra
fields/control characters/duplicates and bounds source count, input bytes/chunk count.
Chunks preserve Unicode boundaries and ordering, no silent partial source indexing.
Pure cosine ranking validates finite bounded same-dimension nonzero vectors and
returns source chunks with stable tie-breaking. Scores mean vector similarity, not
truth, access or relevance certainty. No dependency needed: built-in strings/math.

No API call, index storage, search UI or actual embedding model is implemented.
Future adapter needs bounded embedding responses/dimensions, source/model identity,
explicit start/delete/export, review and native/package tests. Avoid automatic source
refresh; stale identity refuses results until explicit rebuilding.

## Slice evidence

Four pure tests and 463 broad Agent/provider tests pass. Chunking reconstructs every
explicit source in order, preserves Unicode codepoints, rejects malformed surrogate
text/extra fields/duplicates and fails closed on 32-source/256-chunk/256 KiB input
caps. Chunk size is 64-4096 bytes (default 2048). Ranking accepts at most 256 entries,
4096-dimensional bounded finite nonzero vectors, strict chunk fields, stable ties,
copying and 1-50 result limits. Metadata credentials cannot hitchhike in returned
chunk objects. Deliberately selected secret prose is not detected or redacted.

DS/commands/UI inventory/layers pass at 1662/5961 with existing compiler/baseline
warnings. Unfiltered typecheck only inherited missing generated slides-engine/pkg/somnia_slides.js.
No embedding request, index lifecycle, model quality, privacy transport or native/
full app/package E2E evidence. Roadmap: explicit-source embedding adapter and cache
invalidation/review acceptance before wiring search UI or downstream generation.
