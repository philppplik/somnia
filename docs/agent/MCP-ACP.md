# MCP and ACP integration for Somnia Agent

Status: proposed design, not implemented. Verified: 6 October 2026.
Destination: `docs/agent/MCP-ACP.md` on `agent/mcp-plan`.
Repository baseline: `phase1-foundation`, `56e2732148d367209b81b65840aeeadebc43027c` (v10.3.0).

## Decision

Keep the native Somnia Agent core and reviewed editor changes. Add MCP as a tool/context adapter after the MVP. Add **Agent Client Protocol** as a separate optional runtime for installed coding agents. Do not implement IBM/BeeAI's different **Agent Communication Protocol** as a new integration: it merged into A2A and active development is winding down. Reserve A2A for an actual remote-agent requirement. [1-8]

Neither integration grants full project access, credentials, shell access or permission for external writes. Reuse the MVP's context selection, consent, cancellation and revision checks.

### Resolve the ACP name before implementation

| Protocol | Purpose | Verified status | Somnia recommendation |
| --- | --- | --- | --- |
| MCP | Application to tools/resources/prompts | Released revision `2026-07-28` | Post-MVP tool/context integration |
| Agent Client Protocol | Editor/client to a complete coding agent | v1 supported; overall v2 surface still labeled draft | Optional CLI runtime; v1 first, v2 negotiated and feature-gated |
| Agent Communication Protocol | BeeAI-associated agent communication | Official announcement merges it into A2A and winds down development | No new standalone integration |
| A2A | Independent agent interoperability | Specification page reports release `1.0.0` | Defer until remote delegation is needed |

The supplied research's "ACP/CLI mode" means **Agent Client Protocol**, not Agent Communication Protocol. Spell out names in Settings and docs; use `acpClient` and `a2a` internally. [6-8]

## Scope and evidence

This design follows the approved English-documentation, own-branch, optional-provider and explicit third-party-data opt-in direction. The live baseline manifest identifies React, CodeMirror and Tauri. Modules below are **proposed**, not a claim that the agent MVP exists. Preserve the concept's three states: proposed change, accepted editor-buffer change, saved file. [9]

MCP is not inference. Agent Client Protocol is not a model provider. A Claude API model is not Claude Code; an OpenAI model is not the Codex CLI. Check installed adapter support, subscription login, entitlement and costs separately. Protocol support does not guarantee included usage or a supported account.

Initial non-goals: automatic server installation/marketplace, arbitrary terminal/deploy, public Somnia MCP hosting, purchases, background tasks, MCP Apps and unrestricted elicitation/sampling. No central Somnia relay is needed.

## 1. Current MCP contract

### Version and SDK choice

Verified released specification: `2026-07-28`. Self-describing requests replace the mandatory `initialize`/`initialized` handshake and protocol session IDs. Each request carries version, identity and capabilities in metadata. `server/discover` is optional discovery. Streamable HTTP mirrors routing metadata into headers including `Mcp-Method` and `Mcp-Name`. [1-3]

Implement a current lane and a distinct tested legacy lane for `2025-11-25` and supported earlier servers. Use SDK-supported detection rather than mixing old initialization with new stateless semantics. Show negotiated revision in connection details. Cache by server, credential identity, project scope and policy epoch; honor response cache hints without bypassing revocation.

Prefer the official Rust `rmcp` SDK in Tauri's backend: process handles, network policy and credentials stay outside the webview, without adding Node solely for MCP. Its README claims released-spec and legacy compatibility and points to a 3.x migration. A later transport section still calls the revision a draft; the released specification wins, but actual SDK behavior needs testing. The TypeScript README calls v2 its stable line with separate client/server packages. These are maintainer documentation claims, **not compiled dependency choices**. Pin versions, features and lockfiles in a spike. Use a Node sidecar only when a concrete ACP adapter requires it and packaging/update/signing work is accepted. [4-5]

### Servers, tools, resources, prompts

| Surface | Editor value | Host behavior |
| --- | --- | --- |
| Server | Local process or remote capability endpoint | Registration is disabled until explicit enablement; bind identity, command/URL, version and credentials |
| Tools | Docs lookup, diagnostics, controlled preview tests, repo context | Validate complete arguments, policy and destination before execution |
| Resources | URI-addressed documentation/context | User-selected or scoped reads; reading and forwarding to a model are separate permissions |
| Prompts | Reusable server templates | Later user-invoked option; external content, never authority |

Annotations such as `readOnlyHint`, tool descriptions and schemas are not enforcement. Unknown tools default to disabled/ask. A remote read-only call can disclose arguments. Resource links cannot authorize arbitrary URL fetching. [2,10]

Namespace catalog IDs as `mcp.<serverId>.<toolName>` while preserving raw protocol names. Bind grants to a configuration fingerprint and schema/description hash. New tools or changed schemas do not inherit blanket consent. Include only relevant enabled tools in model context.

### Transport and extension policy

- **stdio:** spawn an approved resolved executable with an argument array, minimal named environment and bounded stderr. Never build a shell command. Project config cannot trigger a spawn or package download. Local execution is code execution, not a sandbox.
- **Streamable HTTP:** backend-owned transport/auth; HTTPS for remote endpoints. Localhost/LAN HTTP needs an explicit separate exception. Validate redirects and destinations. Follow revision-specific framing/cancel semantics. [3]
- **Legacy HTTP+SSE:** deprecated; add only for a concrete compatibility requirement, not as default. [1]
- **Multi Round-Trip Requests:** `input_required` can require answers before retrying the original call. Use bounded pending actions; requested input does not widen consent. Reject unsupported requests rather than auto-answering or looping. [1,4]
- **Later extensions:** tasks, subscriptions and MCP Apps require separate work. Roots, sampling and logging are deprecated in the current release. Do not adopt them for new features. Legacy roots, if needed for one tested server, remain hints, not filesystem fences. [1]

## 2. Attachment to AgentCore

```text
Somnia Agent panel: intent, context, consent, Stop
                  |
AgentCore: run/turn ownership, limits, state, events
       |                              |
NativeModelRuntime              AcpClientRuntime
       | tool proposals               | mediated requests/events
       +---------------+--------------+
                       |
 PolicyBroker + ContextBroker + ChangeSetService
                       |
               ToolRegistry/executor
                  |              |
          Native tools     McpClientManager
                  |              | Rust stdio/HTTP
       Buffer/DOM/preview      MCP servers
```

Logical architecture only. An ACP agent can own its own inference/tools. Somnia controls host-mediated requests; control over its direct process/filesystem/network access needs OS isolation.

| Proposed module | Responsibility | Boundary |
| --- | --- | --- |
| `AgentCore` | Run/turn IDs, normalized events, budgets, completion | Model output cannot grant permission |
| `PolicyBroker` | Match integration/action/resource/recipient to current grant | Policy enforced outside prompts |
| `ContextBroker` | Selection, exclusions, limits, provenance, outbound receipts | No hidden full-workspace upload |
| `ChangeSetService` | Base revisions, staged edits, review, conflict, Undo | Accept is not Save |
| `McpClientManager` | Transport lifecycle, version/capabilities, catalog, calls | No raw spawn/credentials exposed to React |
| `AcpClientRuntime` | Sessions, versioned events, permissions, cancel | Diff notifications do not accept changes |
| `CredentialStore` | Per-provider/server backend secret references | Never share all keys with child processes |
| `AuditStore` | Local outcomes, consent receipts, retention controls | No raw secrets/full content by default |

Proposed action envelope: `runId`, `actionId`, `projectId`, `policyEpoch`, `integrationId`, operation, target, schema hash, arguments hash, recipients and data-scope IDs. Grants bind the integration fingerprint, project, operations, resources, recipients, expiry and policy epoch. Actual arguments stay backend-side. Validate every IPC/protocol input at runtime.

### Call lifecycle

1. Explicit registration/enablement, then scoped authentication.
2. Discover permitted capabilities; catalog descriptions remain external data.
3. Collect complete arguments; validate schema, paths, destination and limits.
4. Check execution and disclosure grants independently; show concrete approval if missing.
5. Recheck current policy immediately before dispatch. Revocation wins over a stale dialog.
6. Bound/validate results and retain provenance; do not auto-open links or load privileged HTML.
7. Before feeding results to a model, apply that model destination's data grant. MCP consent does not authorize model transfer or vice versa.
8. Record completed, denied, failed, cancelled or unknown outcome accurately.

Stop cancels/closes per transport, expires pending approvals, drops late run events and cleans up owned processes/descendants where supported. Remote side effects may outlive cancellation. Reconcile unknown outcomes before retrying; never blindly retry a mutating tool after a disconnect.

## 3. Explicit user consent and security

| Gate | Show | Approval means |
| --- | --- | --- |
| Register | Observed source, command/URL, version | Save disabled config; no network/spawn/auth |
| Enable/connect | Execution warning or operator/endpoint, credentials, project scope | Connect, not unrestricted tools |
| Read/disclose | Files/resources, exact recipient and onward model destination, exclusions, duration | This access/transfer only |
| Execute/change | Tool, target, arguments, effects, cost/irreversibility where relevant | One action or explicitly bounded grant |

OAuth authorization does not replace Somnia consent. stdio servers can contact third parties; local transport is not an offline guarantee. Unknown downstream destinations must be disclosed as unknown, not presented as contained.

Settings: integration list, enabled/disabled/error state, connection details, allowed tools, data scope, credential reset and revoke/disable. Action cards name integration and destination. Label AI output and warn that it can be wrong. Before transfer show what leaves the computer, with verified operator/provider privacy links. This is a design control, not a GDPR/EU AI Act compliance claim; legal review is separate.

### Enforcement requirements

- **Injection:** descriptions, results, repository content and remote-agent output are data, not authority. They cannot register servers, alter exclusions, approve writes or add destinations.
- **Process:** limited environment/cwd and tool allowlists are not OS isolation. An unsandboxed process can bypass protocol policy. Do not promise containment unless tested.
- **Paths:** canonical containment after symlink resolution; test Windows drives, UNC, case, junctions and races. Exclude `.env`, keys, credentials, `.git`, dependencies/build output by default. Explicit single-file scope differs from project scope.
- **Webview:** previews and server-rendered content get no privileged agent commands. Narrow trusted-editor commands and revalidate in Rust. Tauri capabilities do not protect against unsafe Rust or child processes. [11]
- **Auth:** backend OAuth discovery, state/redirect handling, public-client PKCE, resource-bound tokens, least scopes. Never pass another provider/server token through. MCP security explicitly forbids token passthrough. Validate metadata/redirect URLs and DNS/IP targets against unapproved local/LAN/metadata access. [10,12]
- **Secrets/results:** named credentials only; scrub logs/errors/crash reports. Cap bytes, items, nesting, decompression and image sizes. No hidden image/link fetches or executable result UI. Secret scanning helps but is not a guarantee.
- **Change/revoke:** executable/version/args, URL, credential principal or permissions changes invalidate affected grants. Project config is importable data, not automatic global configuration.
- **Effects:** external writes/commitments and money/credits need applicable approval. Editor Undo cannot reverse remote writes, deploys or payments. Prefer omitting such tools initially.

## 4. Agent Client Protocol runtime

Expose "Installed agent" separately from the native model runtime. Explain its own login, model/tools, usage policy and updates. Do not treat subscription sessions as generic API keys or transfer tokens between providers. Test each actual adapter/auth flow before claiming Claude Code/Codex compatibility.

### Version semantics

The verified migration guide recommends v1 and v2 support side by side, with v2 feature-gated because the overall surface is draft. [7]

- v1 `session/prompt` stays pending until response/stop reason.
- v2 prompt response acknowledges acceptance only. Completion comes via `session/update` / `state_update`, idle state and stop reason.
- v2 removes v1 standard client filesystem/terminal capability fields. Draft execution features are not implied by negotiating version 2.
- Separate version adapters normalize events. Unknown extension values must not crash or approve an action.

### Honest writes and staging

v1 filesystem methods can read unsaved editor state and write files if advertised. [13] A host must not acknowledge `fs/write_text_file` success while only holding an unapplied diff: the agent may immediately expect that content to exist.

For write-capable integration use a **private staging workspace**, built from the approved snapshot including approved dirty buffers. Reads and writes operate on real staged files; the agent's working directory is staging. Generate base-revision ChangeSets back into Somnia for review; normal Save still writes the real project. Copy only approved content, not the entire repo/secrets/dependencies. Map staging paths internally to editor file IDs. If semantics cannot be honored, omit write capability.

Staging is **not a sandbox**. A CLI can bypass ACP file/terminal methods and read/write real files or use network directly. Constrained write mode requires verified OS isolation or independently enforced runtime restrictions. If unavailable, withhold that mode or present a separately consented trusted/unrestricted runtime with no containment promise. Never call unrestricted execution review-only. This limitation applies to read-only pilots too.

### Permissions, terminals, MCP forwarding

Route protocol permission requests through PolicyBroker, bound to session/action/project. Cancel resolves pending approvals as denied/cancelled. Do not advertise client terminal capability initially. Later commands need separate scope, environment, timeout and actual sandboxing; protocol denial alone does not stop agent-owned processes.

ACP sessions can include MCP registrations. Forwarding config/credentials to an agent is a separate disclosure/execution decision. No automatic forwarding of all Somnia servers. Pilot with none. Later consider a session-bound short-lived proxy exposing selected tools, but do not claim it contains an agent that can reach unrestricted equivalents or bypass OS controls. [13]

## 5. Rollout

| Stage | Scope | Exit gate |
| --- | --- | --- |
| 0 | Native MVP, context opt-in, staged diffs, revisions, Stop, backend policy | No silent upload/write; conflicts and cancel pass |
| 1 | MCP spike: SDK pin, current/legacy fixtures, stdio/HTTP | Tested OS/version/transport matrix, not documentation-only claims |
| 2 | Manual registration, tools/resources, one docs integration | Consent before connect/transfer; grant invalidation verified |
| 3 | Isolated preview checks and selected read-only repo context | No personal cookies; scoped credentials and host policy |
| 4 | Optional ACP pilot, one tested agent, v1, own login | Honest process boundaries; auth/cancel/crash tested |
| 5 | ACP staged changes and ChangeSet import | Verified containment for constrained mode; dirty-buffer/conflict review |
| 6 | Individually approved checks/writes/forwarding/extensions | Exact effects, reconciliation and audit coverage |
| Later | A2A remote delegation or opt-in Somnia MCP export | Concrete need and separate threat model |

Do not bundle optional ACP into MCP launch or add empty roadmap buttons.

Candidate tests, not default installs: a documentation endpoint with no project content in queries until approved; isolated Playwright preview checks; GitHub selected read-only tools with narrow credentials. Playwright's README explicitly says it is not a security boundary, including origin flags. GitHub's README says read-only mode overrides selected write tools. Keep host policy in both cases. Broad filesystem MCP is not a default: native tools understand buffers/revisions/Undo better. [14-15]

## 6. Acceptance tests

1. Disabled/project-supplied config causes no spawn/network/auth/download; injected instructions cannot enable it.
2. Separate current/legacy protocol fixtures; metadata/headers, discovery, MRTR bounds, cache segregation and revoke.
3. Invalid/huge schemas, collisions, changed catalog, incomplete arguments and malformed results fail safely.
4. Approval binds exact arguments/recipient/scope/epoch; revoke during pending dialog prevents dispatch.
5. Result links/images, redirects, DNS and OAuth metadata cannot cross unapproved destination boundaries.
6. Crash/disconnect/Stop/project switch/app close clean up handles and ignore stale events. Unknown remote writes are reconciled, not repeated.
7. Traversal/symlinks/junctions/UNC/case cannot escape scope. Exclusions apply to access, staging and transfer.
8. ACP v1 completion and v2 acknowledgment/state updates differ correctly; replay does not duplicate actions.
9. Acknowledged writes exist in staging; dirty buffers preserved; base-revision conflicts block import; Accept does not Save.
10. Hostile child attempts direct real-project and network access. If it bypasses restrictions, constrained-mode claim fails.
11. Backend-only credentials, no cross-server reuse, redacted logs and explicit expired/revoked-auth errors.
12. Accessible permission cards, named destination/action, keyboard review and no focus theft while streaming.

Use local fixture servers/agents first; protocol tests need no paid inference or real external writes. Compatibility matrices name OS, server/runtime version, transport, revision, auth and features.

## Limits and implementation decisions

SDK/adapters, licenses, packaging and exact pins remain implementation work. Pick first endpoints after operator/data-policy and interoperability review. Cross-platform isolation is a release blocker for promised constrained execution. Recheck provider retention, account entitlement and legal requirements separately.

This is specification/source analysis only. No SDK compiled, server started, coding agent authenticated, paid inference made or runtime security audit performed. Mutable sources must be rechecked and tested versions/commits recorded in implementation PRs.

## Sources

Opened/read on 6 October 2026. Specifications are normative; SDK/server claims are maintainer documentation, not Somnia test results.

1. MCP release announcement (28 July 2026): lifecycle, MRTR, cache, deprecations. https://blog.modelcontextprotocol.io/posts/2026-07-28/
2. MCP tools/resources: schemas, annotations and selection. https://modelcontextprotocol.io/specification/2026-07-28/server/tools and https://modelcontextprotocol.io/specification/2026-07-28/server/resources
3. MCP transports: bindings, metadata and cancellation. https://modelcontextprotocol.io/specification/2026-07-28/basic/transports
4. Official Rust SDK README. https://github.com/modelcontextprotocol/rust-sdk
5. Official TypeScript SDK README. https://github.com/modelcontextprotocol/typescript-sdk
6. Communication ACP official status and merger announcement (29 August 2025). https://agentcommunicationprotocol.dev/introduction/welcome and https://lfaidata.foundation/communityblog/2025/08/29/acp-joins-forces-with-a2a-under-the-linux-foundations-lf-ai-data/
7. Client ACP v2 migration/prompt lifecycle. https://agentclientprotocol.com/protocol/v2/migration and https://agentclientprotocol.com/protocol/v2/prompt-lifecycle
8. A2A released specification. https://a2a-protocol.org/latest/specification/
9. Somnia baseline manifest, retrieved at `phase1-foundation`. https://github.com/philppplik/somnia/blob/phase1-foundation/phase1/package.json
10. MCP security guidance. https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices
11. Tauri capability boundaries. https://v2.tauri.app/security/capabilities/
12. MCP authorization. https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
13. Client ACP v1 methods/capabilities/session configuration. https://agentclientprotocol.com/protocol/overview and https://agentclientprotocol.com/protocol/file-system and https://agentclientprotocol.com/protocol/terminals and https://agentclientprotocol.com/protocol/session-setup
14. Playwright MCP README. https://github.com/microsoft/playwright-mcp
15. GitHub MCP README. https://github.com/github/github-mcp-server

Internal inputs: supplied Somnia Agent concept/research dated 6 October 2026 and approved product direction. These establish intent, not protocol conformance.
