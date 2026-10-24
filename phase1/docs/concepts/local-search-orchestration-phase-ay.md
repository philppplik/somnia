# Memory-only search build/query orchestration (AY)

Host supplies a synchronous capture of only explicitly selected open text sources
and current exact installed embedding model/digest/dimensions/endpoint. Capture is
not a crawler or permission. Adapter AX owns fresh local/capability/digest transport
checks. Build snapshots selected content, hashes/chunks via AT, embeds via AX, and
synchronously recaptures exactly the same IDs/order/text/model facts immediately
before ready commit. No await between final capture comparison and memory commit.

Any raw source/model drift invalidates old ready state and refuses results. Starting
a new build aborts old build/query and immediately discards old vectors. Query has
its own generation, bounded explicit text, fresh capture before/after query embed,
and AU cosine top-k on same model/digest/dimensions. Late/cancelled completion never
publishes. Host must close on selection/project/panel ownership change and app close;
close aborts owned work, clears content/vectors/results and prevents further use.

No storage/download/source expansion/chat answers/cloud fallback/UI. Results are
source IDs/chunk index/plain snippets/similarity, untrusted not confidence. UI must
resolve citations against current selected source map, never model-picked paths.

Atomicity scope: synchronous JS snapshot/compare/commit only. Capture must be a
trustworthy synchronous view of host state; cannot prove native concurrent file or
daemon state absent owner revision checks. Adapter's post-digest check leaves a race
with external model replacement; native full acceptance needs stronger evidence.

Six focused and 516 Agent/provider tests pass: build/query happy path, source/model
before/after inference drift, cancel/close/external abort, replaced-query late result,
strict invalid/pre-abort no I/O and ready discard before failed rebuild. Tests use
injected synthetic adapters, no actual source/provider traffic. DS/commands/UI
inventory/layers pass with inherited compiler/ignored/stale caveats; typecheck only
inherited missing generated Slides module. UI/real Ollama/native/full-app E2E remains
next validation, not claimed here.

Queries keep ready vectors after query-only abort; build failure discards them.
Owner close must be wired on project/panel close next. Ready status never means
actual source picker or downloaded embedding model exists. Source snippets are
not answers. Memory can remain in an in-flight promise until its transport settles,
even after session references clear; this isn't physical secure erasure.
