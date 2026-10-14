# DN: offline labelled retrieval evaluation

Status: **In development**. Developer CLI report only. No app UI, model inference, network, private input or persisted search index.

From `phase1`:

```sh
npm run eval:local-search
npm run test:local-search-eval
```

The default report now uses the [expanded DO corpus](search-expanded-corpus-do.md). Use `npm run eval:local-search -- --original` to reproduce the original eight-source baseline below. The report prints JSON to stdout. It includes the evidence label, each query's returned source IDs and precision, and macro precision by locale/mode/k. Redirecting stdout is an explicit developer choice, not app search persistence. Corpus and evaluator live in `phase1/test/retrieval-eval/`; there is no production command or bundled evaluation surface.

## Corpus and metric

Eight short hand-authored non-private sources, four English and four German, cover harbor freight, mountain winter, an invoice code and garden watering. Eight hand-labelled queries include literal terms/codes and EN/DE paraphrases. Each topic's two language sources are relevant to its query by the test author's label. This is a tiny development corpus, not representative user evaluation or reviewed ground truth.

Precision@1 and@3 are chunk precision: a returned chunk is relevant when its source is in the label set. Denominator is fixed k; missing slots are misses. Duplicate source chunks count as returned chunks, not extra source diversity. Macro averages weigh each query equally within each locale. Metrics do not measure factuality, recall, multilingual generalization or calibration.

The pipeline uses production NFC/LF chunk preparation, ready-index lifecycle, semantic retrieval/coverage and literal phrase retrieval. Every fixture source fits one chunk. Labels are explicit and returned evidence stays literal/untrusted, with no generated answers.

## Observed offline results

| Locale | Mode | P@1 | P@3 |
| --- | --- | --- | --- |
| English | Literal baseline |0.50|0.25|
| German | Literal baseline |0.50|0.1667|
| English | Synthetic topic vectors |1.00|0.6667|
| German | Synthetic topic vectors |1.00|0.6667|

Literal results measure this fixture's exact normalized phrase behavior. Paraphrases intentionally have no literal match. Synthetic4-dimensional vectors are hand-authored from the topic labels; they do not come from `embeddinggemma:300m` or any real embedding model. Their perfect P@1 is tautological semantic plumbing validation, not retrieval quality. P@3 includes an irrelevant tied topic after the two relevant sources, exercising denominator/tie behavior. Report and tests carry this warning directly.

## Decision and next evidence

No chunking/ranking tuning is justified by these numbers. The one-chunk corpus cannot justify chunk-size changes, and oracle-like vectors cannot justify a semantic quality claim. Before tuning, collect approved non-private real-model evidence: exact model digest/daemon/build, exact source/query/chunk hashes and vectors, target hardware, independently reviewed labels and held-out EN/DE queries with distractors, boundaries and multiple chunks. Compare fixed baseline and candidate on the same recorded inputs; report per-query failures, recall/source diversity and latency alongside precision. Do not silently relabel cases after seeing candidate rankings.

Actual native/CSP/inference quality and device acceptance remain open. This patch does not collect real vectors, invoke a model, approve model downloads or enable generation/persistence/cloud. No dependencies or budgets change. Metric input validation, missing slots, duplicates, invalid k, zero paraphrase literal scores and deterministic no-network evaluation are tested.
