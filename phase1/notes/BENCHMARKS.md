# Benchmarks

`npm run bench` (scripts/bench.ts) measures editor-core on generated documents: parse, one attribute edit and undo, at 1k, 10k and 50k nodes. It runs in the frontend CI job and fails when a budget is exceeded. Budgets are deliberately generous (shared CI runners vary); the point is to catch order-of-magnitude regressions.

Reference run (Linux sandbox, 4 Oct 2026):

| Document | Nodes | Size | Parse | One edit | Undo |
|---|---|---|---|---|---|
| 200 sections | 1,004 | 21 KB | 44 ms | 31 ms | 28 ms |
| 2,000 sections | 10,004 | 216 KB | 154 ms | 138 ms | 66 ms |
| 10,000 sections | 50,004 | 1.1 MB | 599 ms | 589 ms | 508 ms |

Finding: every edit re-parses the whole file, so edit cost grows linearly with file size. Fine up to about 200 KB; a 1 MB page costs about half a second per edit. Incremental parsing is the known fix and is a candidate for v10.x if real projects reach that size. Not measured yet: UI rendering, iframe preview refresh, startup time on a real desktop.

## Undo history at project scale (`npx tsx scripts/bench-history.ts`)

Added for plan step 5.1. Measurement only, no budgets, not part of CI. Each scenario runs in its own process with a heap cap (`SOMNIA_BENCH_HEAP_MB`, default 3072; `SOMNIA_BENCH_QUICK=1` for a small matrix). It makes 200 ungrouped edits round-robin over the files (the history limit is 200), then exports state, restores it and undoes/redoes all 200. Heap numbers are `heapUsed` after forced GC. Output: `validation/bench/history.json` (git-ignored).

Reference run (Linux sandbox, 2 GB RAM, Node 22-class, 12 Oct 2026, one run, editor-core incremental parsing on):

| Scenario | Nodes | Source | Edit median / p95 | History after 200 edits | Per step | Undo median | exportState JSON |
|---|---|---|---|---|---|---|---|
| 20 files x 50 sections | 5,080 | 0.1 MB | 1.7 / 5.3 ms | 123 MB | 0.6 MB | 17.5 ms | 0.37 MB |
| 100 files x 50 sections | 25,400 | 0.5 MB | 7.2 / 12.9 ms | 609 MB | 3.0 MB | 89.5 ms | 1.8 MB |
| 1 file, 2,000 sections | 10,004 | 0.2 MB | 7.2 / 21.9 ms | 270 MB | 1.35 MB | 36.8 ms | 0.76 MB |
| 500 files x 20 sections | about 50,000 | - | not finished | 927 MB after 150 edits, then out of memory at a 1 GB heap | - | - | - |
| 1 file, 10,000 sections | 50,004 | 1.1 MB | not finished | 683 MB after 100 edits, then out of memory at a 1 GB heap | - | - | - |

Findings:
- Edit time does not grow over a session (first vs last 50 edits are equal) and stays in single-digit milliseconds up to 25k nodes. The per-transaction `JSON.stringify` compare is not the bottleneck at these sizes, so step 5.2 is not justified by time.
- Undo memory is the cost. Heap grows linearly, about 120 bytes per node per history entry (123 MB / 200 / 5,080 nodes), regardless of how small the edit is. Every entry holds two full snapshots, and each snapshot has an `ids` list with one `{id, from, tag}` per node of every file, plus a clone of the meta. Source strings are shared and are not the cause.
- At about 25k nodes the full 200-step history is about 0.6 GB; at about 50k nodes it exceeds 1 GB. A project of a few hundred pages could therefore exhaust memory in a long session. This supports step 5.3 (patches or checkpoints, or storing ids per file only for files that changed). It is the number to decide with.
- Not measured: Windows desktop webview memory limits, grouped edits (they replace the last entry's `after` only), multi-file operations, UI rendering.
