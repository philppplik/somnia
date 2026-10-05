# Parse and edit performance baseline (2026-10-05)

Measured with `npm run bench` (full reparse with parse5 per edit, no incremental parsing yet), shared sandbox CPU:

| Document | Parse | One edit | Undo |
|---|---|---|---|
| 21 KB (1k nodes) | 43 ms | 31 ms | 36 ms |
| 216 KB (10k nodes) | 132 ms | 105 ms | 54 ms |
| 1.1 MB (50k nodes) | 490 ms | 561 ms | 409 ms |

## Decision
Typical pages (under 200 KB) edit well inside one frame budget of a debounced update. Only 1 MB+ documents get noticeably slow. Incremental parsing would mean replacing the full-tree id and binding rebuild in `EditorProject.reparse`, which is the riskiest part of the core (node ids, undo snapshots, canvas bindings). Proposal: keep full reparse, move it off the keystroke path (debounce while typing) if users report lag, and spend the time on features first. Revisit when a real document exceeds 500 KB.
