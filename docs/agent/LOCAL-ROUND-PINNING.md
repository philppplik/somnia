# Verified local round input pinning

Base42bb4c24f. verifiedLocalProvider snapshots exact approved model/messages/tools/output limit synchronously before weight verification's first await. A caller mutating request during async locality/capability verification cannot silently switch model, append private context or retarget offered tools afterward. Keep original AbortSignal rather than cloning it; original cancellation still suppresses chat even when caller replaces request.signal.

Existing verification per round, local weight proof, capability lint and privacy gate remain. Loopback alone is not local-model proof, no fallback or cloud/provider broadening added. Test fetch is synthetic local Ollama endpoint, not actual model/task quality. No native/save/UI claims.

Tests pause first show response, mutate caller model/context/tool/limit then assert chat still uses exact original fields; cancellation test aborts original signal while replacing caller signal and asserts chat count0. Existing protocol/local/capability/stream-cancel tests unchanged.30 focused tests pass. No dependencies/cloud/spending or visual UI change.
