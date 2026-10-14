# CH: query-time source focus

Search can target all indexed sources or one exact already selected/indexed source without rebuilding. Focus filters candidate vectors before topK, so a focused source's best snippet can surface even when absent from global topK. Result scope visibly names the source; ranking/score is within focused scope, not a global rank or factual confidence. Changing focus clears results/context and requires explicit query; no automatic inference.

Unknown/unindexed focus rejected by session before query embedding and by retrieval before ranking. Full frozen vector snapshot/lifecycle/descriptors still validated before focus. All-source default preserves prior behavior. Source/index clear/drift resets focus. Existing model/privacy/source/citation guards unchanged; no new read, source discovery, index persistence, generated answers, cloud or download action.

Validation:12 focus/retrieval/session unit tests and1 new light/dark browser test plus3 CE/CC regressions pass. Low-similarity focused source absent global top1, unknown focus no-embedding, no-rebuild, result clearing and exact citation scope checked. 390px light/dark pixels inspected: focus/limit/scope and source citation readable. DS/Layers/Commands/UI-Commands pass; inherited Layers missing-transpiler/87 ignored/4 stale. tsc only inherited missing generated slides WASM module. Synthetic provider/data only; native/Rust/WASM/full desktop E2E CI-only, no real inference/download/user data, no deps/budgets, $0.

Roadmap-Delta: selected-open-text memory search -> query-time indexed-source focus without widening scope. Real runtime/download/CSP/quality/cancel/production citations remain acceptance gates. Parent-directed own-chain/stale-remote base retained for integrator git am -3/reject-merge.
