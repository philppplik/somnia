# Parse and edit performance baseline (2026-10-05)

Measured with `npm run bench` (full reparse with parse5 per edit, no incremental parsing yet), shared sandbox CPU:

| Document | Parse | One edit | Undo |
|---|---|---|---|
| 21 KB (1k nodes) | 43 ms | 31 ms | 36 ms |
| 216 KB (10k nodes) | 132 ms | 105 ms | 54 ms |
| 1.1 MB (50k nodes) | 490 ms | 561 ms | 409 ms |

## Decision
Typical pages (under 200 KB) edit well inside one frame budget of a debounced update. Only 1 MB+ documents get noticeably slow. Incremental parsing would mean replacing the full-tree id and binding rebuild in `EditorProject.reparse`, which is the riskiest part of the core (node ids, undo snapshots, canvas bindings). Proposal: keep full reparse, move it off the keystroke path (debounce while typing) if users report lag, and spend the time on features first. Revisit when a real document exceeds 500 KB.

## Partial reparse (branch feature/incremental-parse, flag `EditorProject.incremental.enabled`, default off)
Idea: after a patch, only the innermost safe container (div, section, main, article, aside, nav, header, footer, ul, ol, blockquote, figure, span, body) is re-parsed with `parseFragment` using the existing parse5 element as context. Locations after the range are shifted in place, ids of untouched nodes stay. If the old or new content is not provably safe, the code falls back to the full parse. Safe means: strictly nested and fully closed tags, no raw-text/table/form/svg/etc. tags, no block inside p/heading/a, no entities, balanced formatting elements before the container.
Proof: `incremental.test.ts` runs random edit fuzzing with `verify=true`, which full-reparses after every partial reparse and compares tree shape, offsets and all parse5 locations. 5 seeds x 60 rounds x 25 edits plus a typing test (248 of 300 ordinary edits take the partial path).
Bench (SOMNIA_INCREMENTAL=1 npm run bench, edit at the start of the document = worst case): one edit 216 KB 152 -> ~30 ms, 1.1 MB 501 -> ~115 ms. Undo still does a full reparse. 150 random seeds pass the differential test.
Open: snapshot/clone cost per transaction, undo path, enabling the flag in the app after a soak period.
