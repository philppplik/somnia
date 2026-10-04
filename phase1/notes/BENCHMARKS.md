# Benchmarks

`npm run bench` (scripts/bench.ts) measures editor-core on generated documents: parse, one attribute edit and undo, at 1k, 10k and 50k nodes. It runs in the frontend CI job and fails when a budget is exceeded. Budgets are deliberately generous (shared CI runners vary); the point is to catch order-of-magnitude regressions.

Reference run (Linux sandbox, 4 Oct 2026):

| Document | Nodes | Size | Parse | One edit | Undo |
|---|---|---|---|---|---|
| 200 sections | 1,004 | 21 KB | 44 ms | 31 ms | 28 ms |
| 2,000 sections | 10,004 | 216 KB | 154 ms | 138 ms | 66 ms |
| 10,000 sections | 50,004 | 1.1 MB | 599 ms | 589 ms | 508 ms |

Finding: every edit re-parses the whole file, so edit cost grows linearly with file size. Fine up to about 200 KB; a 1 MB page costs about half a second per edit. Incremental parsing is the known fix and is a candidate for v10.x if real projects reach that size. Not measured yet: UI rendering, iframe preview refresh, startup time on a real desktop.
