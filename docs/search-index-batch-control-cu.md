# CU: explicit bounded index embedding batch control

The actual LocalSearchPanel build action now offers conservative8 or standard32 chunks per embedding request. Standard32 is unchanged default. This affects LocalSearchSession -> LocalEmbeddingAdapter.embedPrepared, not query embeddings, normalization/chunking, dimensions, source budgets, or ranking.

The local planned request count and largest UTF-8 text payload use the same NFC/LF/codepoint chunker and2048-byte build chunks. They are request-text sizes, not serialized JSON overhead/token estimates or a VRAM/daemon-memory promise. Selecting another size closes the existing session, cancels owned request, clears all results/citation context and consent, and requires an explicit rebuild. Busy/disabled controls cannot change size.

Only8/32 accepted at session and adapter boundaries. Adapter validates all prepared chunks/hashes/source revisions before any request, retains exact digest/local capability/privacy checks before each batch and digest check after it, abort checks between batches, frozen validated vectors and all-or-nothing session ready commit. No partial-ready fallback. No download/inference performed against an actual daemon during development.

Validation: batch planner, provider-adapter8+1 transport and stop-before-second-batch test, existing embedding/session tests plus session forwarding/default/no-I/O invalid-size test; narrow390px light/dark browser consent-reset/build/clear flow. Screenshot fixture uses a synthetic adapter; production adapter batching is unit-tested separately. Actual daemon/model quality/CSP/native full-app integration remains CI/manual gate, no performance/memory claim. No deps, no budgets raised, no persistence/cloud/generated answers/writes, $0.
