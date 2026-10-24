# Documents asynchronous owner guards (BK)

Owner generation/engine recheck across structural snapshot/op/snapshot and restore,
queued undo/redo history, pointer-hit/keyboard-hit and geometry promises. Drag pending
coordinates bind owner generation; old-owner coordinates aren't applied to new doc.
Selected replacement+split checks owner between worker calls. Geometry additionally
checks original caret identity, not just owner. Old engine no longer publishes
selection/history into new attachment on covered awaits.

3 deferred snapshot/hit/geometry tests and existing capture/Documents tests pass
(21 total); exact same caret object reused with new engine still refuses geometry.
DS/Commands/Inventory/Layers pass; tsc only inherited generated Slides missing.
No UI/apply adapter, inference, new dependencies, native/WASM/full E2E or local
search change. Nonvisual plumbing only; no screenshot. Existing tests retained.

This narrows owner drift, not an atomic acceptance lease. Existing structural
rollback catches may fail and refresh failure after engine mutation still needs
state recovery/undo policy. Same-owner selection movement during edit needs a
reviewed acceptance lock before wiring rewrite. Native fidelity/inference and all
worker-stage fault injection remain future acceptance work. Layers retains compiler/
87ignored/4stale warnings. No inferred permission from a capture or settled queue.

Roadmap-Delta: Documents remaining asynchronous owner mutation paths guarded;
reviewed-summary wiring and transactional rollback/acceptance remain open.
