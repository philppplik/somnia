# BU: selected-text local summary draft

Documents private reviewed selection now offers an optional explicit local summary action. Selection review alone sends nothing. Separate unchecked per-scope approval names the exact summarize-task model (or explicit Ollama studio/global choice). A cloud route is unavailable; no fallback, downloads or installs are performed.

The production factory reuses panelBridge's existing guarded Ollama stream: fresh local-weight verification, capability/context preflight and privacy lifetime guard. Prompt is only captured selected text, never document URL/name/owner, surrounding content, history, custom prompts or tools. Capture is rechecked before, during and after stream. Tools, missing/non-stop completion, empty/invalid/over-4096-byte output fail closed. No partial draft is accepted. Literal text only, no markup evaluation. Draft remains private/in-memory, not applied/saved/copied/exported. Settings/source drift invalidates consent and result; owned AbortController and 120-second deadline cancel the HTTP operation. Cancellation does not prove the daemon stopped computing.

Synthetic fixture provider tests only; no real model inference/download/user-data processing in development. Live daemon quality, native CSP/runtime, real close/cancel and full desktop integration remain CI/manual gates. Document atomic edit acceptance remains unresolved and is not used. Search remains paused awaiting integration/CI signal.

Validation: 9 helper/prompt/capture tests and 2 browser tests passed. Browser fixture checks unchecked consent/no auto-run, literal inert script output, source drift, discard/cancel; 390px light/dark pixels inspected. DS, command and UI-command ratchets pass. Layers pass with inherited missing-transpiler/87 ignored/4 stale warning; tsc still fails only missing generated slides WASM module. No dependencies or budgets changed; $0.

Roadmap-Delta: Documents selection review -> optional bounded local summary draft UI complete at synthetic fixture level; real daemon/native integration/quality remains gated. Apply/rollback, Sheets live range lease and local-search integration unchanged.
