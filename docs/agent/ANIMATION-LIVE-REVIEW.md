# Animation selected-key live sidepanel wiring

Base: int/beta5 4e553ac3. In development, no release or all-studio tool claim. Installs the existing Animation selected-key port ([ANIMATION-KEY-PORT.md](ANIMATION-KEY-PORT.md)) in the agent side panel, the same wave-3B follow-through the Docs/Slides/Sheets live wiring slices established.

## What runs now

With the Animation studio active, an open animation document and a local Ollama provider, a side panel run offers exactly two tools to the model: `animation_inspect_key` and `animation_propose_key`. No cloud fallback and no broad UI command exposure; when the provider is not Ollama or no animation document is open, the panel keeps the existing plain chat without tools or document context. The Animation studio declares the pair in its agent manifest so the panel pins the studio context; tool exposure itself is session-bound in the bridge, intersected with the real port definitions.

The staged proposal surfaces as a public preview (document name, layer/property/key time, before/after value) with Accept/Reject. The private one-use capability stays host-side in `AnimationKeyTransactions` (mirroring `TextReviewTransactions`): pending reviews block new turns, and stop/error/reset/project change revokes them. Accept consumes the capability before native entry and commits through `AnimationSession.applyReviewed` with the host execution permission; only a verified `applied:1` receipt becomes an owned Undo. `applied:0` (no-op) and `null` (unknown post-commit state) are honest failures, never reported as success or failure-0; the consumed review is not blindly retried. Undo goes through `undoReviewed` with the exact owned receipt and refuses newer manual edits, reopen and preview state. No disk write, no autosave, no save/export receipt is implied.

## Honest boundaries found while wiring

- The port's `animation_propose_key` schema used `oneOf` for the scalar/vector union; the local tool lint (`selectLocalTools`) refuses combinators as too complex for small local models, which silently removed every tool from Ollama runs. The offered schema is now the combinator-free equivalent (`type: ['number','array']` with numeric item bounds); the port's own runtime validation is unchanged and stays the enforcement point.
- Reviewed commits replace the immutable document object, so the host execution permission cannot pin document identity across apply/undo. It pins the run and the session owner instead; exact review/receipt identity stays enforced by the port and the native session.
- A `structuredClone` of the reviewed value is passed to `acceptReviewed` so a mutated UI copy cannot alter the committed value.

## Verification

- `animationKeyTransactions.test.ts`: propose/accept/undo against a real `AnimationSession`, reject consumes the capability, duplicate/clear refusal, manual edit after staging makes accept fail instead of overwriting.
- `animationLivePanel.test.ts`: real `realCore.run` through the panel bridge with a stubbed loopback daemon (verified weights, declared tool support, scripted rounds). Proves exactly the two port tools are offered, the staged preview never mutates the session, a pending review blocks the next run before any provider traffic, and apply/undo round-trip through the host. Cloud providers and missing documents get no tools.
- Existing animation port and acceptance suites unchanged and green.
- Browser fixture `test/agent-animation-live-panel.*` (synthetic core, no engine/model/network): actual `AgentPanel` preview/accept/undo passes in Light and Dark; both screenshots inspected. Synthetic, not native engine or model proof.

No dependencies, downloads, cloud calls or spending. Rust/WASM/full desktop, real-model quality and native save/recovery evidence remain CI/manual work, as with the sibling live-wiring slices.
