# Explicit memory search UI (AZ)

Agent panel disclosure mounts search only when opened; closing disclosure unmounts
and clears session. Project generation/panel ownership changes abort and clear chosen
sources/query/vectors/results. Source edit/closure or selection change clears index.
No defaults, mount probes, crawls, automatic embedding, answers or cloud fallback.

First source scope deliberately narrow: visible open .txt/.md files from app's
openFiles/files text map, never hidden-path, binary, closed files or entire folders.
User explicitly checks full open text files, then Build. Selected prose can contain
secrets: extension/path filtering isn't secret detection. Bounded pipeline may reject
oversized selection, empty chunks or invalid text rather than partial index.

Explicit Build snapshots exact installed embeddinggemma:300m digest using native
metadata, 768 native dimensions; AX verifies local/embedding/digest for all batches.
Query uses AY/AU ready memory vectors and returns ranked source chunks, similarity
(not confidence), host-resolved citation button and escaped literal snippet text.
Citation opens original text tab, no model-chosen URL/file. Rechecks selected current
source list before open; chunk number is ordinal, not a precise cursor highlight.
Query edits clear prior results; source changes clear them immediately via effects.

Model setup opens existing Local AI settings. No auto-download. Generic exact-model
pull review is available there but embedding-specific license/card review is not
complete: this slice expects model already installed and must not claim a ready
optional install experience. Next follow-up must expose reviewed embedding model
license/source/size/runtime in model picker before calling optional download done.

Two component/unit tests + existing four settings tests, 516 Agent/provider tests,
three browser fixtures pass. No default I/O, explicit build/query/citation, literal
HTML injection inert, source edit/owner close discard, five locale coverage and
light/dark/narrow screenshots. Fixture adapter synthetic: no actual model inference
or native/packaged E2E. Missing generated Slides module still blocks full tsc.
DS/commands/UI inventory/layers retain existing compiler/ignored/stale caveats.

Roadmap-Delta: selected-open-text memory search/citations UI wired; real model/native
transport/CSP/runtime acceptance, embedding-specific optional download license review
and full desktop close/citation quality evidence remain open. No new deps/spend.
