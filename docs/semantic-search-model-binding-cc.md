# CC: ready-index model identity checks

Semantic-search pause lifted by parent. This patch continues search-only selected open .txt/.md sources, optional embeddinggemma:300m setup/download review, citations, memory-only index, no generated answers/persistence/cloud. No actual user-data inference/download was executed in development.

Before each explicit query or citation open, inspect current model/runtime metadata and compare exact normalized loopback endpoint/digest/dimensions with the accepted index. Drift or unavailable metadata discards index/results and explains rebuild; no automatic polling/rebuild. Citation opening also checks selected sources/raw content and preserves existing exact-span fallback. Metadata inspection has owned cancellation and30s deadline, preventing a hung inspector from accepting a late result. Actual embedding adapter still performs its own fresh local capability/digest/privacy checks before/after inference.

User-visible check/rebuild notices in five locales; existing source chooser/build/query/citation behavior intact. Indexed contents remain untrusted source snippets, never approval or instructions. Changing model fixture makes zero new embeddings or citation navigation. Metadata check itself sends no source/query text. This does not establish real model quality, native CSP/runtime, optional-download success or daemon cancellation.

Validation: 14 binding/session/adapter unit tests,2 new browser tests and3 prior AZ browser tests pass. AZ count assertion strengthened for new mandatory reads, all other assertions retained. Fresh checks/no-auto-traffic/digest drift/unavailable/citation no-open/timeout/abort/source invalidation tested. 390px light/dark full-page pixels inspected: chooser, budgets, check boundary and literal cited snippet readable. DS/Layers/Commands/UI-Commands pass; inherited Layers missing-transpiler/87 ignored/4 stale. tsc only inherited missing generated slides WASM module. Native/Rust/WASM/full desktop E2E CI-only; no deps/budgets, $0.

Base: parent directed own patch chain on locally stale origin/int/beta5 2b365863, not remote reported7ebb121e. Integrator must git am -3/reject-merge against real tip. No push.

Roadmap-Delta: semantic search resumes -> explicit ready-index model binding checks before search/citation. Real download/runtime/CSP/citation/quality acceptance still open; no generated answers or persistent indexes added.
