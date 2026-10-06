# Somnia Agent core

Branch `agent/core`, base `56e2732148d367209b81b65840aeeadebc43027c`
(`phase1-foundation`, v10.3.0). UI-free TypeScript core; no disk writes or paid
inference. No Superset or Emdash code was copied.

## Modules

- `phase1/src/lib/agent/types.ts`: provider-neutral request/events/messages/tools.
- `openRouter.ts`: streaming SSE client, credential resolver, fixed official URL,
  redirect blocking, no retries, ZDR + supported parameters + no fallback.
- `projectTools.ts`: authorized editor-buffer read/list/write-proposal tools.
- `session.ts`: sequential bounded tool loop, stop, status/events, complete-turn
  transcript, project-scoped snapshot restore/clear, proposal cleanup.
- `src/lib/agentCore.test.ts`: fixtures and streaming/security regressions; picked
  up by the existing `test:core` glob without a package.json edit.

Dependency: integrate the privacy branch's `agent/privacy.ts` first. This commit
imports `runWithProviderConsent`, `AgentPrivacyGate`, `AIProvenance` and
`createAIProvenance` but deliberately does not include the other branch's file.

## Provider contract

```ts
interface AgentProvider {
  readonly id: string;
  readonly locality: 'cloud' | 'local';
  stream(request: AgentProviderRequest): AsyncIterable<AgentProviderEvent>;
}
```

The request contains model, messages, tools, maxOutputTokens and AbortSignal.
Events: text, indexed tool-call fragments (ID/name/arguments concatenated), usage,
finish. Assistant messages carry toolCalls, tool results carry toolCallId.
Provider errors throw sanitized errors; there is no undocumented error event.
Only finishes `stop`/`tool_calls` complete a turn; `length`/`aborted` fail closed.
Providers must abort transport AND body consumption and terminate their stream.
Byte limits are not tokenizer guarantees; local model context sizing belongs to
its adapter. OAuth/ACP adapters can implement the interface later, but this does
not establish OAuth availability or subscription entitlement.

`locality` is descriptive, not permission. Every provider uses the shared gate;
only its verified local-model exception is exempt. The strengthened gate requires
processing:'local' plus loopback; OpenRouter leaves processing unspecified (cloud).
Never derive processing:'local' from a URL or arbitrary user input. Remote Ollama and future
providers require consent. Each inference step/retry is a new guarded call.
OpenRouter keeps its guarded Promise alive until the SSE body is consumed using
a single-slot backpressure bridge. It never returns a Response early from the
gate. Revocation aborts body reads and no later delta is accepted. Redirects are
blocked. Inject a real AgentPrivacyGate in tests, not a no-op replacement.
The optional consentGuard is an extra context-inspection callback only; it cannot
bypass the shared gate. API keys never enter snapshots, tools, chat or logs.

## Panel wiring

```ts
const tools = new AgentProjectTools({
  projectId: openedProject.id,
  files: () => openedProject.currentEditorFiles,
  allowed: (path, action) => contextPermissions.isAllowed(path, action),
});
const session = new AgentSession({
  provider: new OpenRouterProvider({ getApiKey: () => credentials.readOpenRouter() }),
  model: reviewedModelId,
  tools,
  onEvent: event => panelEvents.dispatch(event),
});
await session.prompt(userPrompt);
```

Names outside this module are illustrative host dependencies, not existing
Somnia exports. Obtain explicit cloud consent and separate file context grants
first. allowed() must default to false outside selected scope and is checked on
every tool action. Chat-only sessions omit tools. Context UX must show outgoing
content when required; the gate enforces consent, not preview. Earlier tool
results remain in complete history, so context revocation must clear/rebuild the
transcript before sending another request.

Use a new session for each project. On project switch cancel(), await the active
prompt, copy/discard staged proposals, then dispose that instance. Do not reuse
its adapter for another project. prompt() rejects parallel turns and pending
review sets. A started turn's controlled failure resolves with status/notice
signals; invalid concurrent/state/input calls throw. Partial text can remain in
the UI as cancelled/error, but never enters replayable history after failure.

snapshot() returns cloned complete turns and a project ID. restore() rejects
wrong-project IDs, injected system roles, incomplete tool sequences and oversized
history. Persist only under an explicit local-history setting; the module does
not use localStorage. clear() deletes this instance, not external storage or
provider records. Observers receive cloned events; exceptions do not authorize
or break tools. The panel can coalesce text updates per frame and must add its
own accessible statuses and unknown-event fallback. Assistant/proposal metadata
has AI provenance with humanReviewed:false; review code sets true after review.

## Review and saving

proposals() returns copies of `{path,before,after,provenance}`, with before equal
to the exact editor text (including unsaved changes), or null for new files.
Write tools stage only; subsequent reads return staged text. Original editor and
disk never change. Proposals are exposed only after a complete final response.
Incomplete turns, failure, stop or limits discard their staged changes.

Bind before and the current editor revision to the Diff-Engine proposal. It must
check stale bases, hunks, dependencies and permissions, then apply one accepted
batch as one undo step. This module has no apply or save API. discardProposals()
clears staged data only, never undoes accepted editor edits.

**Release blocker outside this module:** desktop fileAdapter enables autosave
(1s idle / 5s continuous). Editor mutation alone can write disk. Diff integration
must implement its real holdAutosave(paths) hook and clear the hold only on
explicit Save before claiming accepted-but-unsaved. No autosave changes here.

## Sandbox

Only canonical slash-separated relative HTML/CSS/JS/TS/JSON/MD/SVG paths are
accepted. Absolute/drive/UNC/traversal/dot/empty/backslash/control paths fail.
.env variants, credentials/key files, .git, dependency/build directories fail
even if the host grants access. Listings hide non-authorized names.

The tools use a current editor buffer map, not OS handles. A model cannot resolve
or follow a symlink here, because no disk accessor exists. This is **not** a
physical symlink audit: the adapter that loads/saves files must enforce canonical
native project roots and symlink containment. Do not replace this map with disk
access without that check. Filename blocking is not complete secret detection;
source and prompts can contain secrets. Context/privacy owns further inspection.

Defaults: 256 KiB per file, 1 MiB staged output, 1 MiB context/response, 8 inference
steps, 24 tool calls, 4096 output tokens per request, 120 seconds per turn. No
silent truncation or automatic retry. Unknown provider costs remain absent, not
zero. Limits are not hard currency caps; abort is not a refund/provider-stop
guarantee. A provider ignoring AbortSignal violates the contract and can delay
completion.

## Verification and remaining work

Local typecheck, production frontend build, and existing core tests were run
with fixture providers only. No paid request, live OpenRouter credential/model,
GitHub CI, Windows/native key-store or UI/visual/a11y test is claimed.

Remaining: panel/context preview, credential store/model picker, privacy UI,
Diff-Engine bridge + autosave hold, native physical-root enforcement, durable
history opt-in/delete, explicit retry UI, live model/tool compatibility, Ollama
and separately authorized OAuth/ACP adapters. This is a tested core, not a
completed end-to-end feature.

Protocol sources checked:
- https://openrouter.ai/docs/api/reference/streaming
- https://openrouter.ai/docs/guides/features/tool-calling
- https://openrouter.ai/docs/guides/routing/provider-selection
