# Somnia Agent architecture

Status: integration design draft, 6 October 2026. Named contracts below are proposed boundaries, not certified exports. Reconcile them with the topic-branch contract documents before wiring the app.

## Baseline and component ownership

Baseline: `phase1-foundation` at `56e2732148d367209b81b65840aeeadebc43027c` (Somnia 10.3.0). The existing app is Tauri/React with CodeMirror. The checked source has:

- `phase1/packages/editor-core/src/index.ts`: `EditorProject`, `revision`, `transact`, `expectedRevision`, create/replace operations and shared history. `Origin` currently has no `agent` member; do not silently assume one.
- `phase1/src/store/appStore.ts`: app/store integration and `applyOperations`.
- `phase1/src/components/DiffSplit.tsx`: in-editor CodeMirror merge view with an editable current-source pane. It is not isolated Agent staging and must not be used unchanged for unaccepted proposals.
- `phase1/src/lib/sourceDiff.ts` and `diffView.ts`: display/navigation helpers, not a patch-authorization mechanism.
- `phase1/packages/editor-core/src/persistence.ts`: save-state and storage separation. Confirm its actual use with the app's current save path during integration.

The new components are independent workstreams:

| Component | Responsibility | Must not own |
| --- | --- | --- |
| Core | Run state, model/tool loop, bounded context, validated proposals, cancellation | UI rendering or direct disk writes |
| Provider adapter | Model discovery/capabilities, transport, normalized stream and usage | File execution, permission decisions or editor mutation |
| Panel | Input/context, action cards, status, AI notices, settings and review navigation | Provider secrets or independent write logic |
| Diff/review | Isolated change sets, revisions, hunk decisions, accepted editor transaction | Inference transport or automatic Save |
| Privacy boundary | Versioned opt-in, recipient policy, revocation and request guard | Claims that consent alone establishes legal compliance |
| Native host | Credential storage, canonical paths, narrow backend commands | Arbitrary privilege for preview content |

```text
Panel -> Core run controller -> privacy/request boundary -> Provider
               |                                         |
               +-> validated tool dispatcher <------------+
                        |                    |
                 project read adapter   isolated proposal store
                                              |
                                      code-editor review
                                              |
                                      editor transaction
                                              |
                                      ordinary user Save
```

No model or tool output creates permission. Enforce scope in the host, not only in a prompt. Project content, remote tool results and streamed argument fragments are untrusted data.

## Contract design

The following is notation for a proposed interface, not production code. Exact exports remain owned by the implementation branches.

### Current Core provider contract

The supplied Core contract defines `AgentProvider { id, locality: 'cloud' | 'local', stream(request): AsyncIterable<AgentProviderEvent> }`. `AgentProviderRequest` contains `model`, readonly `messages`, readonly `tools`, `maxOutputTokens` and `signal: AbortSignal`. Messages have roles and optional tool-call IDs; tool definitions have name, description and JSON-schema-like parameters.

Events are `text {text}`, indexed `tool-call {index, id?, name?, arguments?}` fragments, `usage {inputTokens?, outputTokens?, costUsd?}` and `finish {reason}`. Accumulate fragments by index before dispatch. Cancellation/errors are not dedicated events in this contract; align thrown errors and abort handling at the Core boundary. Discovery is not a method on this interface and requires a separate adapter capability. Absent cost means unknown.

`AgentCloudConsentGuard` receives `{provider, endpoint, request}` and returns void or a Promise. It must run for every cloud request/retry with the exact payload. A no-op callback is not valid integration. Run/project IDs, revision checks and permissions remain Core responsibilities outside this provider request shape.

### Current privacy contract

`AgentPrivacyGate`, singleton `agentPrivacy`, `assertProviderConsent(target)` and `runWithProviderConsent(target, operation, signal?)` provide the shared consent boundary. `ProviderTarget` is `{provider, endpoint?}`; the run wrapper passes an AbortSignal and checks before/after the operation. `revoke()` aborts tracked cloud controllers. `createAIProvenance(provider, model)` records AI origin, timestamp and `humanReviewed: false`. UI exports are `AgentConsentNotice`, `AgentPrivacySettings`, `AgentErrorNotice` and `AIGeneratedLabel`.

Current limitations: the consent record contains only version/grantedAt, not per-route scope. `isLocalOllama` checks the provider name and an HTTP loopback URL, not model locality or whether a local proxy sends data onward. Do not treat that URL check as proof of local-only processing. Integration must close those gaps or narrow its claims; see [PRIVACY.md](PRIVACY.md). These supplied source contracts are not proof that every caller is wired to them.

### Proposed provider boundary requirements

A provider supports capability/model discovery and a cancellable stream for a normalized request. The request contains a run identity, approved conversation/context, model ID, permitted tool schemas, output limits and privacy requirements. The provider does not receive native file handles or a write callback.

Normalized events need to express:

```text
text delta
complete tool-call proposal (ID, name, arguments)
usage (tokens, reported cost if known, request ID)
completion (reason)
cancellation
error (safe code/message, retryability)
```

Only complete, schema-valid tool arguments are dispatchable. Providers may stream argument fragments internally, but the dispatcher must not run fragments. Distinguish unknown cost from zero; distinguish provider-reported usage from local estimates. Capability flags are not evidence of tested model quality.

### Run/session boundary

A run has `runId`, session/project identity, current turn identity, selected provider/model, context permissions, limits and an AbortSignal-equivalent cancellation channel. Ignore stale events after cancellation or project changes. Store bounded, project-isolated history outside the project repository by default.

State transitions include ready, preparing context, requesting, executing tools, awaiting permission, reviewing, completed, cancelled and failed. Preserve pending proposals independently from the active run. Model/provider changes occur at an explicit request boundary.

### Project read boundary

List/read/search returns approved current editor buffers where available, not only disk copies. Results include project-relative file identity and revision/basis identity. Selection context ties a DOM node or code range to its current file, buffer revision and breakpoint. Existing diagnostics name the revision they describe.

Canonicalize native paths; block traversal, symlink escape, secret files and excluded directories. Resolve an explicitly opened single file as its own scope rather than granting its parent directory. Bound result size and report omissions. Recheck grants immediately before access.

### Proposal/review boundary

A change set has an ID, project identity, base revisions or hashes, complete proposed text/edits, new-file flags, hunk IDs and known dependency groups. Model `write` tools, if named that way, must create proposals only. They never mean disk writes.

Validate every selected file before a coherent acceptance. Reject stale bases rather than silently rebasing/fuzzy matching. Apply accepted hunks as one validated editor transaction with an undo group. Preserve the distinction between the core's abstract proposal and the diff engine's concrete hunk representation; integration must explicitly translate them.

Do not set an accepted status until the transaction succeeds. A partial failure must not leave some files changed while claiming whole-set acceptance. New files require whole-file review and existence checks. Discarding a proposal changes no original data.

## Agent loop

1. Resolve context and current approval; explain actual processing destinations.
2. Request a bounded model stream through the privacy guard.
3. Render normalized text/actions; collect complete tool calls.
4. Validate schema, run identity, tool allowlist, path scope and budgets.
5. Ask for any missing permission. Refusal returns a safe tool result rather than hidden retries.
6. Execute only approved reads/diagnostic retrieval, or create an isolated proposal.
7. Return bounded results with matching tool-call IDs.
8. Continue until a completed proposal, stop, error or limit.

Retries are bounded and visible. Do not automatically repeat a billable request after an ambiguous failure. Stop prevents new tools and attempts transport cancellation; it cannot guarantee provider-side billing has stopped.

## MCP, ACP and subscription runtimes

MCP is a tool/resource connection, not model inference or a sandbox. Agent Client Protocol (ACP) is an editor-to-agent session protocol. Do not confuse it with the separate Agent Communication Protocol project. Each external runtime/server needs installation, operator, transport, permission and data-destination review. Arbitrary terminal access is not a consequence of enabling chat.

A subscription-auth agent runtime is not interchangeable with an OpenAI-compatible API adapter. Its own tools may have side effects before Somnia reviews a diff. Require an audited restricted bridge and snapshots, or keep it clearly outside the native propose-only workflow. Do not claim the manual-diff guarantee for a runtime that writes files directly.

## Security, recovery and acceptance

- Secrets stay backend-side. The renderer receives masked status and safe events only. Preview content has no Agent/native privileges.
- Opt-in is checked for each cloud request; revocation invalidates future requests. Remote Ollama/cloud models are not the local-only exception.
- Provider fallbacks retain privacy and capability restrictions. A failed strict policy must stop, not relax itself.
- Restart restores complete proposals but rechecks their bases. Reconcile uncertain writes before retrying. Save conflicts remain owned by Somnia's existing save path.
- Integration tests cover fragmented streams, tool-call IDs, stale events, invalid schemas, limit exhaustion, consent revocation, project switch, excluded paths, secret redaction, stale bases, partial acceptance, atomic undo and save separation.
- Native and real-provider tests are required separately. Mock tests do not prove credential protection, platform permissions, provider availability or current account settings.

## Integration checklist

Before release, align actual Core/Provider/Panel/Diff/Privacy exports and cancellation semantics; wire one shared cloud guard; confirm the local-only Ollama test; connect proposal acceptance to the editor transaction API; check keyboard/focus and the bottom-only gradient against the panel spec; verify credentials on supported native platforms; reconcile [PRIVACY.md](PRIVACY.md) with `agent/privacy`; test, then describe only demonstrated behavior in release notes.

See [CONCEPT.md](CONCEPT.md) for user flows and [PROVIDERS.md](PROVIDERS.md) for transport distinctions.
