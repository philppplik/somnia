# Documents selection capture (BI)

Builder-owned read-only extraction, no inference/UI/apply adapter. Actual engine
attachment increments a monotonic session generation; DocumentsCanvas supplies
source identity at attach and detaches only its own engine before dispose. Legacy
attachment without identity still edits normally but cannot claim AI capture.

Frozen capture binds generation/identity/name/rev, directional anchor/head, sorted
UTF-8 span and selected text only. Ready/non-saving/non-locked editable paragraph,
unique block, nonempty <=4096-byte selected text and exact character boundaries
required. Raw media identity is private host evidence, not prompt content or a URL
to fetch. No neighboring paragraph/full document/hidden text included.

Comparison catches exact source/selection/revision/identity/generation drift. This
is extraction evidence, not approval or an atomic accept lease. Queued editing /
pending worker work still needs BH owner/serialization gates before inference or
apply wiring. No model target chosen, AM DTO adapter registered, save/write or UI
change. Local search pause maintained. Capture must not be forwarded wholesale as
a prompt; downstream preparation takes selected text only with reviewed scope.

3 new capture tests plus existing Documents panel/command/export/component tests
pass. Typecheck only inherited generated Slides missing; DS/Commands/Inventory/
Layers pass with inherited compiler/87ignored/4stale caveats. No native/WASM/full
app E2E, formatting acceptance or actual selected-user-data disclosure performed.
No dependencies/spend. Nonvisual plumbing only, no screenshot needed.

Roadmap-Delta: real builder-owned generation/UTF-8 selection capture exists; summary
review/provider wiring and queued atomic rewrite remain future phases.
