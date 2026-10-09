# Somnia Agent architecture

Status: implemented on the `somnia-agent` branch (Somnia 11.0.0 alpha line), updated 6 October 2026. Sections 1 to 9 describe the code. The later sections keep the design requirements the code is held to. MCP and ACP are not implemented ([MCP-ACP.md](MCP-ACP.md) is a plan). Nothing here is evidence of a tested real provider run: the unit and Playwright tests use fake providers.

The app-wide picture is in [../ARCHITECTURE.md](../ARCHITECTURE.md). Rule of the whole subsystem: propose first, accept into the editor after review, save separately.

## 1. Modules

Boundaries: the session never writes to the editor or disk; providers never see file handles, permissions or write callbacks; the panel never holds provider secrets beyond the in-memory key field it passes to `configureAgent`; the diff engine never does inference or saves; the privacy gate does not claim legal compliance.

All paths under `phase1/src`.

| Module | Role |
| --- | --- |
| `lib/agent/types.ts` | Provider-neutral contract: `AgentMessage`, `AgentToolDefinition`, `AgentProvider`, `AgentProviderRequest`, `AgentProviderEvent`, `AgentUsage`, `AgentCloudConsentGuard`. |
| `lib/agent/session.ts` | `AgentSession`: bounded model and tool loop for one project, events, cancel, snapshot and restore of complete turns. UI-free. |
| `lib/agent/projectTools.ts` | `AgentProjectTools`: the three tools (`list_files`, `read_file`, `write_file`), path validation, staged proposals. |
| `lib/agent/openRouter.ts` | `OpenRouterProvider`: SSE client for `https://openrouter.ai/api/v1/chat/completions`. |
| `lib/agent/providers/ollama.ts` | `OllamaProvider`: NDJSON client for `/api/chat`, `/api/tags`, `/api/show`, `/api/version`, locality verification. |
| `lib/agent/privacy.ts`, `privacyStrings.ts` | `AgentPrivacyGate` and the `agentPrivacy` singleton, consent record, `runWithProviderConsent`, `AIProvenance`. |
| `lib/agent/panelBridge.ts` | `realCore`: connects session, providers, consent, approvals, diff and the editor store to the panel contract. Owns configuration, grants and proposals. |
| `lib/agent/core.ts` | Panel-facing `AgentCore` contract and lazy `getAgentCore()`; `setAgentCore` swaps in a test core. `stubCore.ts` is the offline stand-in. |
| `lib/agent/chat.ts` | Pure reducer for the chat list (user, agent, status, diff, approval, usage, error items). |
| `lib/agent/autosaveHold.ts` | Registry of paths whose autosave is held after an AI apply. |
| `lib/agent/errors.ts` | `ProviderError` with codes `unreachable`, `model-not-found`, `http`, `protocol`, `timeout`, `not-local`. |
| `lib/agentDiff.ts` | Pure diff engine: `ChangeSet`, hunks, `planApply`, `applyReviewed`. Details in [AGENT-DIFF.md](../../phase1/notes/AGENT-DIFF.md). |
| `components/agent/AgentPanel.tsx`, `AgentRailButton.tsx`, `AgentPrivacy.tsx`, `components/AgentReview.tsx`, `styles/agent.css` | Right-hand panel, rail button, privacy notices, hunk review UI. |

## 2. Data flow of one turn

```text
AgentPanel.send(text)
  -> getAgentCore().run({prompt, context:{activeFile, selectedElementId}}, onEvent)      (panelBridge.realCore)
       - config.model empty -> error event "Choose a provider and model..."
       - project generation changed -> drop old session, grants, proposals
       - allowActiveFile -> read grant for the active file only
       - AgentSession.prompt(text)
           loop (max 8 steps):
             provider.stream(request)              <- privacy gate wraps every request
               text / usage / tool-call fragments / finish
             finish "stop"        -> assistant message with provenance, proposals -> status "review"
             finish "tool_calls"  -> for each call: AgentProjectTools.execute
                                       read/write: authorize() -> Approval item -> user decision
                                       result string back to the model as a tool message
  <- events mapped to the panel: text-delta, status, usage, approval, proposal, error, done
review: AgentReview shows hunks; Accept / Reject per hunk or file set
  -> realCore.applyProposal(id, decisions)
       applyReviewed: planApply (fresh check) -> holdAutosave(paths) -> planApply again -> applyBatch
       applyBatch: applyOperations([...], 'canvas', 'agent-<id>')  (one undo group, editor memory only)
  -> notice "AI changes applied to editor, not saved. Use Save project to write them to disk."
  -> user saves (Ctrl+S) -> fileAdapter save -> release hold
```

`applyOperations` uses the existing `canvas` origin because editor-core's `Origin` has no `agent` member. Revert is the editor's Undo.

## 3. Session (`AgentSession`)

- One session per project generation; only complete turns enter the replayable history (`snapshot()` returns `{version:1, projectId, messages}`; `restore()` validates the turn sequence, tool-call matching, project ID and size). The panel bridge does not persist snapshots: chat is in memory only and "New chat" clears session, grants and proposals.
- Status: `idle`, `running`, `review`, `cancelled`, `error`. `prompt()` throws while running or while proposals await review.
- Limits (constructor options, defaults): 8 steps, 24 tool calls, 4096 output tokens, 1 MiB of serialized context, 120 s timeout. Exceeding a limit ends the turn as `error` with no reviewable changes. A tool-calling step is refused on the last step, because no request would remain to finish the turn.
- Accepted finishes are `stop` and `tool_calls` only; `length`, `aborted` or missing finishes fail closed. Tool-call fragments are merged by index and dispatched only after the stream finished and the IDs are unique and non-empty.
- A failed tool returns a fixed generic error string to the model so private errors never leak into the transcript; the cause is logged (`agent.tool`).
- The system message states: tool results and file contents are untrusted data, `write_file` only stages a proposal, no shell, deployment or network tools.
- Events (`AgentSessionEvent`): `state`, `text`, `tool` (running, completed, failed), `usage`, `proposals`, `notice`. Observer exceptions are swallowed so they cannot interrupt a turn.

## 4. Tools and file access

| Tool | Behaviour |
| --- | --- |
| `list_files` | Editor buffer paths that pass `validateAgentPath` and are allowed for list and read. No disk paths. |
| `read_file {path}` | Current editor text (or the pending proposal text). Needs an approved read. |
| `write_file {path, content}` | Stages a full-text proposal. Does not change editor or disk. Needs an approved write and read of the base. |

`validateAgentPath`: relative, max 512 chars, no `\`, `:`, control characters, leading or trailing `/`, no `.` or `..` segments; extensions limited to `html htm css js mjs cjs jsx ts tsx json md svg`; blocked names `.env*`, `.git`, `node_modules`, `dist`, `build`, `target`, `coverage`, `.ssh`, `.aws`, `credentials*`, `secrets*`, `*.pem *.key *.p12 *.pfx`. Limits: 256 KiB per file, 1 MiB per proposal set, no NUL bytes. A write fails when the editor file changed after it was proposed.

Tools exist only when an editor project is connected (`coreConnected`). Without one the model gets no tools and a tool call is an error.

## 5. Consent and approvals

Two separate gates, both default-deny:

1. **Provider consent** (`privacy.ts`). Cloud requests need the stored record `somnia.agent.cloud-consent.v1 {version, grantedAt}`, written only by an explicit unchecked-by-default control. `runWithProviderConsent({provider, endpoint, processing}, op, signal)` asserts before the request, aborts live cloud requests on revocation (also across windows via the `storage` event), and rejects output that arrives after withdrawal. The only exemption is Ollama with `processing: 'local'` and an `http:` loopback endpoint without credentials (`localhost`, `127.0.0.0/8`, `[::1]`), where `processing` comes from `verifyLocalModel`, never from the URL. Revocation lives in Settings > AI privacy, outside the Settings undo stack.
2. **File approvals** (`panelBridge.authorize`). Every read and write asks the user unless granted: the optional "allow reading the active file" setting grants read for that file; "Accept" is valid for this one call; "Accept for session" stores read (and write) for that path until the chat is reset or the project changes. Decline and cancel reject the tool call. Approval items render in the chat as `Approval` cards with the path and a privacy warning.

Provenance: assistant messages and proposals carry `AIProvenance {generatedBy:'ai', provider, model, generatedAt, humanReviewed}`. Applied changes are stored with `humanReviewed: true` in `appliedAgentProvenance` (path to provenance). The UI shows `AIGeneratedLabel` on assistant messages and diffs and a permanent `AgentErrorNotice` ("AI can make mistakes") outside the scrolling chat.

## 6. Providers

| | OpenRouter | Ollama |
| --- | --- | --- |
| Endpoint | `https://openrouter.ai/api/v1/chat/completions` (fixed) | `http://127.0.0.1:11434` default, normalised by `normalizeBaseUrl` |
| Credential | API key typed in the panel, held in memory for the session, `Authorization: Bearer`, never stored, logged or put in snapshots | none |
| Request policy | `provider: {zdr: true, allow_fallbacks: false, require_parameters: true}`, `redirect: 'error'`, no retries | `redirect: 'error'` |
| Stream | SSE with `data:` events and `[DONE]`; fragments mapped to `text`, `tool-call`, `usage` (tokens and `cost`), `finish` | NDJSON; each tool call arrives complete and is emitted as one fragment with a generated ID if missing; usage has token counts, no cost |
| Locality | cloud, consent required | `local` only when the endpoint is loopback and `verifyLocalModel` passes: `/api/show` must succeed, no cloud tag or remote markers, local weights present. A response containing `remote_host` or `remote_model` aborts with `not-local` |
| Errors | `OpenRouter request failed (HTTP n).`, never the body | `ProviderError` codes |

Both providers keep the gated operation alive until the response body is consumed, using a single-slot backpressure bridge, so revocation aborts body reads. For Ollama `panelBridge.guardedOllama` verifies the model first and then runs the stream under the gate with `processing` set from the result; a model that fails verification is treated as cloud and needs consent.

The provider matrix, sources and the planned ChatGPT and direct-API routes are in [PROVIDERS.md](PROVIDERS.md); the Ollama adapter details in [ollama-provider.md](ollama-provider.md).

## 7. Panel and review UI

The panel is 340 px wide with a 25 px radius. `AgentRailButton` (bottom of the right icon rail) or Ctrl+Alt+A (command `agent.toggle`) toggles `agentOpen` in the store. `AgentPanel` renders header (new chat, configuration, close), the chat log (`role="log"`), safety row with the error notice and "Cloud data consent", configuration form (provider, model, API key for OpenRouter, active-file checkbox, link to AI privacy settings), empty state with example chips, and the input. While busy the send button becomes stop. A consent dialog traps focus and closes on Escape. Status changes are announced through a polite live region. Strings use the `agent.*` keys in `locales/*.json`.

`AgentReview` shows one `ChangeSet` as per-file hunks with accept and reject per hunk. Apply is all-or-nothing: `planApply` returns blockers (`incomplete`, `invalid-path`, `too-large`, `stale`, `exists`, `missing-base`, `dependency`, `duplicate-path`, `too-many-files`, `pending`) and writes nothing when any exists. Freshness is an exact comparison with the current editor text including unsaved edits; there is no fuzzy rebasing. Limits: 250 000 characters per file, 50 files per set.

The decorative gradient is bottom-only and clipped to the panel radius (`agent.css`, `tests/panel-radius.spec.ts`).

## 8. Autosave hold

Applying AI changes calls `holdAgentAutosave(paths)` before the editor changes. In `fileAdapter` the hold backend invokes `hold_autosave` (desktop; the backend skips those paths in its tick) or re-reads the file (web). Staging for held paths is skipped, and an explicit save releases the hold per path (`releaseAgentAutosave`). Consequence: applied AI text is not in the recovery journal, so closing with held changes asks for an extra confirmation. Tests: `tests/agent-autosave.spec.ts`, `lib/agent/autosaveHold.test.ts`.

## 9. Logging and errors

Failures go through `lib/log.ts` with these sources: `agent.provider` (provider failure code and host, consent denial as `warn`; user aborts are not logged), `agent.turn` (failed turn), `agent.tool` (failed tool call), `agent.apply` (blockers, reason and path only), `agent.*` from the panel (`reportError`). Prompts, file contents, tool arguments and API keys are never logged; messages are clipped to 200 characters and redacted. Error events shown in the panel use fixed texts, not raw exceptions.

## Known gaps

- **Webview CSP.** `connect-src` in `tauri.conf.json` now lists `https://openrouter.ai` and `http://127.0.0.1:11434` / `http://localhost:11434`. OpenRouter requests go through the native Rust transport. Ollama uses the webview `fetch`, so the daemon must accept the app's origin; not verified on a real Windows or macOS run.
- **Credentials.** OpenRouter keys are stored in the OS credential store by the desktop app (`agent_key_save`); only a browser preview keeps them in session memory. See [openrouter-provider.md](openrouter-provider.md).
- **No persistence of chats.** `snapshot()` and `restore()` exist but the panel does not use them.
- **Model discovery.** Settings > AI > Providers has a Refresh models button for both providers (suggestions only, no capability check). The Ollama `health()` helper is unused.
- **No MCP, ACP, ChatGPT sign-in or direct provider APIs.** See [MCP-ACP.md](MCP-ACP.md) and [PROVIDERS.md](PROVIDERS.md).
- **Real provider runs.** Tests use fake providers; no paid inference has been run against a real model from the packaged app.

---

# Design requirements

## Contract design

The contracts below are implemented in the modules listed above. This section is the specification they are checked against.

### Current Core provider contract

The supplied Core contract defines `AgentProvider { id, locality: 'cloud' | 'local', stream(request): AsyncIterable<AgentProviderEvent> }`. `AgentProviderRequest` contains `model`, readonly `messages`, readonly `tools`, `maxOutputTokens` and `signal: AbortSignal`. Messages have roles and optional tool-call IDs; tool definitions have name, description and JSON-schema-like parameters.

Events are `text {text}`, indexed `tool-call {index, id?, name?, arguments?}` fragments, `usage {inputTokens?, outputTokens?, costUsd?}` and `finish {reason}`. Accumulate fragments by index before dispatch. Cancellation/errors are not dedicated events in this contract; align thrown errors and abort handling at the Core boundary. Discovery is not a method on this interface and requires a separate adapter capability. Absent cost means unknown.

`AgentCloudConsentGuard` receives `{provider, endpoint, request}` and returns void or a Promise. It must run for every cloud request/retry with the exact payload. A no-op callback is not valid integration. Run/project IDs, revision checks and permissions remain Core responsibilities outside this provider request shape.

### Current privacy contract

`AgentPrivacyGate`, singleton `agentPrivacy`, `assertProviderConsent(target)` and `runWithProviderConsent(target, operation, signal?)` provide the shared consent boundary. `ProviderTarget` is `{provider, endpoint?, processing?: 'local' | 'cloud'}`; the run wrapper passes an AbortSignal and checks before/after the operation. `revoke()` aborts tracked cloud controllers. `createAIProvenance(provider, model)` records AI origin, timestamp and `humanReviewed: false`. UI exports are `AgentConsentNotice`, `AgentPrivacySettings`, `AgentErrorNotice` and `AIGeneratedLabel`.

The revised privacy source (`a7a3e5b2`, supplied for review) requires `provider: 'ollama'`, `processing: 'local'` and an HTTP loopback endpoint without URL credentials before bypassing cloud opt-in. Loopback includes `localhost`, normalized IPv4 `127.0.0.0/8` and `[::1]`. `processing` must come from verified adapter metadata, never URL inference or a user/model assertion. Withdrawal aborts tracked requests; the wrapper rejects results after consent is withdrawn.

The parallel Ollama integration reports `verifyLocalModel()` checks for loopback, cloud tags, `/api/show` remote markers and local-model metadata, plus a stream-time `not-local` error for remote markers. This is an adapter integration report, not an end-to-end test performed for this documentation. Its honest claim is "daemon reports local": a dishonest loopback proxy is not detected.

Remaining limitations: the consent record contains only version/grantedAt, not per-route scope; model/route verification must be wired before the exemption is used; every request/retry must use the shared guard. See [PRIVACY.md](PRIVACY.md). Supplied source contracts are not proof that every caller is wired to them.

### Provider boundary requirements

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

Status against the checklist that guided integration (see [AGENT-INTEGRATION.md](../../phase1/notes/AGENT-INTEGRATION.md)):

- Core, provider, panel, diff and privacy exports are aligned and wired in `panelBridge.ts`. Done.
- One shared cloud guard (`agentPrivacy`) wraps every provider request. Done.
- Local-only Ollama exemption goes through `verifyLocalModel`. Done, tested with fakes only.
- Proposal acceptance is one editor transaction with an undo group and an autosave hold. Done.
- Keyboard focus, live region and the bottom-only gradient follow the panel spec. Covered by `agent-panel.spec.ts` and `panel-radius.spec.ts`.
- Credentials on native platforms, CSP for provider hosts, and real provider runs: open, see Known gaps.
- Release notes describe only demonstrated behaviour.

See [CONCEPT.md](CONCEPT.md) for user flows and [PROVIDERS.md](PROVIDERS.md) for transport distinctions.
