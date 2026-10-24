# Per-invocation tool argument pinning

Registry clones arguments synchronously after current tool permission/cancel checks, before invoking tool callback. An async native snapshot cannot validate one input then stage a caller-mutated replacement later. Host context and original AbortSignal stay live; current native target checks remain in each tool. Does not snapshot authority or bypass changing native state.

Tests pause actual Sheets snapshot then replace input with invalid content, prove original approved input stages. Nested argument alias mutations cannot alter pending callback. Uncloneable non-JSON function arguments refuse before callback, original abort still suppresses invocation. No new tools/runtime/UI/cloud/deps/spending. Existing tests unchanged.
