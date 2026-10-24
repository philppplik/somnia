# Frozen local retrieval contract (AU)

AL's cosine/top-k arithmetic is reused, not reimplemented: finite nonzero bounded
vectors, exact dimensions, stable original-entry-order ties, top-k 1-50, max 256
entries/4096 dimensions. Snapshot copies and freezes nested vectors/chunks/descriptor
without mutating callers, rejects unknown/duplicate targets and extra fields, and
caps cumulative text at 256 KiB, each chunk 4096 UTF-8 bytes. Every declared source
must have a chunk. Empty/partial descriptors aren't advertised as retrievable.

retrieveLocalTopK requires AS ready lifecycle and freshly matching host descriptor,
then independently matches the frozen snapshot descriptor and revalidates data.
No stale model/digest/dimension/source-revision retrieval, late-build or cancelled
index. Results are frozen plain-text chunks, similarity score, trust:untrusted,
confidence:not-measured, permission:false. Scores are not factual confidence,
source reliability or authorization for downstream disclosure/commands/apply.

No vector store, persistence, embeddings call, UI or source discovery. Caller must
strip AT hash fields into AL-compatible chunk DTO and bind actual vectors to the
captured source/pipeline/model, not fabricate revisions. Descriptor matches cannot
prove vector provenance. Host atomically recaptures content/model facts before
ranking and invalidates on pipeline changes. Empty selected sources must be excluded
explicitly before embedding: this layer refuses missing chunks rather than silently
indexing partial sources. Codepoint-safe chunks can still split grapheme clusters.

Roadmap-Delta: frozen memory vectors + ready/fresh retrieval contract. Real embedding
adapter, source-to-vector build attestation, tokenizer retrieval quality, query/hash
lifecycle and native/packaged privacy evidence remain open. No deps/UI/spend.

Four focused and 501 Agent/provider tests pass. Exact cosine values/ties/top-k,
deep freeze/caller mutation, dimension/NaN/infinity/zero/value bounds, unknown/extra/
duplicate/missing targets, per-chunk/cumulative caps, forged snapshot revalidation,
4096-dim numeric tolerance, all ready-state/model/source drift/cancel checks covered.
DS/commands/UI inventory/layers pass with inherited compiler/ignored/stale caveats;
unfiltered tsc only missing generated Slides bridge. No native/full app E2E.
