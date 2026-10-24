# Per-task local routing

AI > Local > Default local model per task offers chat, vibe, code and summarize. Refresh reads fresh installed Ollama inventory, then verifies each entry using the existing locality guard. Selecting a model alone changes nothing. Use for this task updates the settings draft; Save configuration persists it. Clear removes one override. One undo restores the immediately preceding task draft, never an unrelated later value. Existing runs are not rewritten.

Agent Panel explicitly selects Chat, Code or Summarize. No prompt-word classification. The task override wins over the general provider, per-studio model and general fallback route. The actual selected provider/model is visible. Before creating a provider the task route checks fresh exact installed inventory; missing/unavailable inventory fails visibly. The existing per-request locality guard remains mandatory. No task override can fall back to cloud. With no task override the existing visible provider configuration and its consent rules remain unchanged.

Vibe shows its saved default with an explicit Use for Vibe action in New Studio. It checks installed inventory and locality before selecting that exact configured model. The user still creates the Studio explicitly. Existing Studios keep their pinned model. Native model references include saved task models, but every native inference request retains its existing local-model and permission checks.

Task-assigned models cannot be deleted through the local manager until a replacement is saved or the override is cleared and saved. Saved missing models are retained as visible errors rather than silently substituted. The setting is a preference, not a task-quality claim; no automatic download, task inference or quality ranking was added.

## Validation boundary

Node Agent/provider tests plus isolated browser controls cover schema, task choice, exact names, undo/clear, missing inventory, zero cloud/network construction on a blocked panel request, draft-only changes and narrow layout. Browser inventory is synthetic. Full desktop inference, persistence, native Vibe dispatch and Rust tests run in CI only. No cargo or generated WASM build is attempted here. No new dependencies or spend.

## Roadmap-Delta

Added explicit persisted local per-task defaults, visible Agent task selection, explicit Vibe adoption, no-cloud override execution, missing-model failure, single draft undo, clear and deletion protection. Not added: automatic intent classification, task quality recommendations, native inference proof or cloud task fallback.
