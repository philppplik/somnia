# Citation span selection (BD)

Ordinal reconstruction against the exact current selected source, not substring
find (repeated chunks cannot jump to first match). Reuses 2048-byte chunk pipeline.
Pure mapper converts LF-normalized offsets back to raw CRLF/CR UTF-16 offsets.
If NFC changes text, refuses precise highlight; opens original tab only. No guessed
normalization offsets, changed source, model URL/path or source scope expansion.

Host passes optional span with exact raw buffer; appStore rechecks raw/valid bounds
before open/jump. SourceEditor rechecks again before range select/scroll/focus,
then consumes the jump immediately to avoid stale replay and retained raw snapshot.
CodeMirror may normalize CRLF documents internally: if editor raw string differs,
it refuses span rather than applying wrong offsets. Such files may only open.
NFC full alignment and editor newline-coordinate adapter remain later work.

3 mapper tests pass: repeated ordinal, CRLF/CR/multibyte BMP, NFC/forged/invalid
refusal. 520 Agent/provider tests pass; 3 existing AZ browser tests pass; one new
real SourceEditor browser test selects [192,256) in repeated source and focuses,
light/dark390 pixels inspected. Native/runtime/download/full-app E2E not run.
First browser navigation awaited load and timed out due imported app resources;
DOM-content-ready plus actual editor selection assertions passed twice. No old
test weakened. tsc inherited Slides module missing; DS/Commands/Inventory/Layers
pass with inherited compiler/87ignored/4stale caveats. No new deps/spend/push.

Roadmap-Delta: exact provable ordinal span highlight/cursor path for unchanged
NFC-stable LF buffer, safe tab-only fallback for unsupported normalization cases.
Not full Unicode alignment or packaged desktop acceptance.
