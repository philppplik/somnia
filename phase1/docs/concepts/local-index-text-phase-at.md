# Deterministic index text prep (AT)

Explicit id/text scope only, AL caps/strict fields validated before hashing. Pure
normalizer canonicalizes CRLF/CR to LF and NFC, never trims/truncates/lowercases
or strips embedded instructions. Unicode codepoints are intact; grapheme clusters
can span chunks. Chunker uses AL's deterministic no-overlap UTF-8 byte chunks.

Existing agentTask/hash.ts local Web Crypto SHA-256 is reused, no new dependency or
weak fallback. Missing crypto fails closed. Original text hash and normalized hash
are separate. Source revision hashes pipeline version/chunk size/original hash/
normalized hash, so raw edits and chunk-size changes invalidate AS even when
normalized text matches. Hashes are change identities, not encryption/permission
or proofs of trustworthy source acquisition. IDs mapped separately by AS.

Source and chunks copied before async hashing, returned arrays/objects frozen.
Caller supplies only id/revision projection to AS, retaining raw/normalized hashes
and per-chunk hashes locally for diagnostics. No embedding transport, persistent
index, source discovery or UI. No claim of actual source hash capture by builders.

Roadmap-Delta: locally computed content/pipeline revision prep complements AS;
host must recapture actual content atomically before committing/querying vectors,
including model/digest/dimension verification. Pipeline version must change when
normalization/chunk rules change. Model tokenizer-aware semantic chunk boundaries,
retrieval quality and native/packaged/privacy evidence remain open.

Five focused tests and 497 Agent/provider tests pass. Known empty/ASCII/Unicode/
block-boundary SHA-256 vectors cross-check independent Node crypto; repeated builds
identical, UTF-8 caps/reconstruction/whitespace/NFC/newlines, raw-edit/pipeline drift,
mutable caller input across await, malformed/oversized/extra fields and missing
crypto fail-closed tested. DS/commands/UI inventory/layers pass with existing layers
compiler/ignored/stale warnings. Unfiltered tsc still only missing generated Slides
bridge. No native/full-app E2E or real embedding inference evidence.
