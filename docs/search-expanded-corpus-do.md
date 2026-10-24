# DO: expanded offline EN/DE retrieval corpus

Status: **In development**. Developer fixture report, no real model evaluation or tuning.

The default `npm run eval:local-search` now uses expanded-v2:30 sources (15 English,15 German),40 default2048-byte chunks,26 labelled queries and104 per-query/mode/k rows. `npm run eval:local-search -- --original` preserves the DN baseline. No app code or retrieval behavior changes.

Original eight sources/queries and their order remain intact. Added cases include multi-chunk freight archives and backup documents, late evidence, deliberately split phrases at byte2048, CRLF/decomposed accents/emoji, near invoice codes, negation, temporal contradictions, lexical-overlap garden/harbor distractors, metaphor and unanswerable questions. Six sources are multi-chunk. Boundary phrases `gate open` and `Tor offen` cross chunks and have zero literal matches, even though the complete source contains them. NFC variants match after normalization. Late recovery phrases appear in later chunks. Two unanswerable queries have empty relevance sets and count every returned chunk as a miss.

## Labels and receipts

Each query declares exact relevant source IDs, language and case tags. Labels are hand-authored development judgments, not independently reviewed human ground truth. Source relevance is coarse: any chunk from a relevant source counts as relevant, including filler. Duplicate source chunks can inflate precision without better source coverage. Multi-chunk/oracle metrics therefore still cannot justify tuning.

Reports expose query text/relevance/tags; every source's raw/normalized hash, revision, tags and chunk count; every chunk's source/ordinal/hash/UTF-8 size. These receipts make later real-vector comparisons reproducible against exact prepared input. Vectors are still hand-authored15-dimensional topic vectors, not real embeddings. Negative/distractor topics are separate artificial dimensions. No model plug-in or vector capture is implemented or invoked here.

## Observed expanded fixture metrics

| Locale | Mode | P@1 | P@3 |
| --- | --- | --- | --- |
| English | Literal baseline |0.6154|0.2564|
| German | Literal baseline |0.6154|0.2308|
| English | Synthetic topic vectors |0.9231|0.6923|
| German | Synthetic topic vectors |0.9231|0.6923|

Fixed-k chunk precision and equal query weighting are unchanged. Oracle-like P@1 drops because unanswerable queries have no relevant source. These scores describe fixture mechanics only. They are not model quality, a comparison to DN's different query mix or evidence to change chunking/ranking.

Before real quality evaluation, independently review labels, add chunk-level relevance and source-diversity/recall/abstention metrics, use held-out queries, and record real-model digest/version/vectors with these hashes. Evaluate baseline/candidate on identical inputs and report boundary/distractor failures, not only a macro average. Do not infer absent knowledge from an irrelevant top result. No tuning from oracle vectors.

Tests keep the original baseline checks, validate30 unique balanced source IDs/relevance referents,40 chunks and multi-chunk coverage, deterministic receipts, absent/boundary zero scores and positive late/NFC literal cases. No dependencies, budgets, private input, real download/inference, generation, cloud or app persistence.
