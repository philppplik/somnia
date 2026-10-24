# Per-model inspect pending (BO)

Explicit installed-row metadata inspect disables the owned pending button and
uses a five-locale model-metadata label, not runtime/inference progress. A ref guard
prevents repeated clicks before React state updates. Refresh starts a new ownership
set; stale prior finally cannot clear newer pending requests or publish old evidence.
No extra automatic probes/model downloads/inference, no production dependencies.

One deferred metadata browser test passes: duplicate disabled-button click causes
no extra reads, exact model result becomes declared embedding capability. Light
390px pending-state pixels inspected; dark capture did not clearly show pending
text, so dark pending visual acceptance remains unverified. Initial fixture delayed
lexicographically first-page model rather than later model; corrected delayed tag
and test passed. No existing tests changed. DS/Commands/Inventory/Layers pass;
tsc inherited Slides missing only. No native/full shell E2E or real daemon proof.

Roadmap-Delta: explicit per-row pending UX and duplicate-inspect guard; metadata
remains declared evidence, not actual task fit/readiness. No search slice.
