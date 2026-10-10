# Extension permissions and consent engine

Branch: `ext/permissions-security`, based on `9d7d9b6dde6d2f42c50802096d72c10ab988c1cc`.

This branch implements policy, persistence, revocation and trusted service routing.
It does not certify an OS sandbox or enable expanded guest APIs. Native process
launching and OS-backed adapters must pass the runtime integration gates below.
Package naming stays `.somniax` with root `somnia-extension.toml`. Existing six
SDK permission strings remain unchanged. Manifest-v2 now accepts one optional,
closed `security` object. Missing security means tier A, no filesystem, network,
secrets, clipboard or agent rights. This is not a reinterpretation of v1 grants.

## Manifest declaration

```toml
[security]
tier = "A" # A: sandboxed, B: native full trust, manual packages only
secrets = ["apiKey"]
clipboardWrite = false

[security.fs]
read = "ask" # none / project / ask
write = "project"

[[security.network]]
host = "api.example.com"
paths = ["/repos/*"]
reason = "Fetch only public repository metadata"

[[security.inject]]
secret = "apiKey"
host = "api.example.com"
header = "Authorization"
prefix = "Bearer "

[security.agent]
models = ["host-default"]
reason = "Suggest cleanup through your configured agent"

[security.clipboardRead]
reason = "Paste the image you choose into your project"
```

Unknown fields are errors. Hosts are unique exact lowercase DNS names, no wildcard
subdomains or ports. Paths are case-sensitive prefixes with optional trailing `*`,
no queries, traversal or encoded separators. Omitted paths cover the whole host;
empty paths cover nothing. Reasons are required, plain text, 20-280 characters.
Secret injection requires both a declared slot and an approved network host.
Duplicate injection headers and transport/cookie headers are refused. Tier B is
rejected in Store manifest validation. The native executable package format is
not enabled by this declaration: package-v2 still rejects native artifacts.

## Broker contract for Branch 5 UI

`phase1/src/lib/extensions/permissionBroker.ts` exports `PermissionBroker`,
`PermissionSession`, `RuntimePrompt`, `RuntimeChoice`, `PermissionHooks`,
`SECURITY_STORE_KEY`, `NATIVE_HOLD_MS` and `PermissionError`.

Create the broker in trusted host code with a durable `ConsentStorage` and an
`invalidate` hook. The hook must cancel work, terminate the affected process or
worker, remove event subscriptions, unload its panels and invalidate queued RPCs.
The engine closes sessions and aborts its signals before awaiting that hook.
No capability authority comes from a guest-provided id or generation. The
supervisor owns opaque `PermissionSession` tokens. Pass workspace trust and
virtual status explicitly to `openSession`; omitted context is untrusted.

- On first extension-enabled startup, `snapshot().restricted` is true even if
  old v1 enabled flags exist. `registry.loadActiveExtensions()` checks the same
  read-only startup gate. Settings must show a review and call
  `acknowledgeFirstRun()` only after confirmation. Merely opening Settings is not
  consent. `setRestrictedMode(false)` before acknowledgement is refused.
- Tier B requires `setDeveloperMode(true)` and manual installation. On trusted
  pointer/key down call `beginNativeHold(manifest)`. Render
  `nativeHoldProgress(id)` using the engine's monotonic clock. After 3,000 ms call
  `approve(manifest, 'manual')`. Cancel on release before completion, blur,
  pointercancel, lost capture and hidden document. No typed-name confirmation.
  The hold binds to the complete manifest, consumes once and is never persisted.
  Store approval, changed manifest, interrupted or short hold fails closed.
- Show an install review before `approve`. This grants declared install scopes,
  NOT outside-project folders or clipboard read. The first-run gate remains
  separate, even if a package has been approved.
- `updateReview(candidate)` returns added scopes and remembered declined version.
  `acceptNonExpandingUpdate` accepts only reduced/unchanged sandboxed rights;
  native updates always need review. Expanding updates leave old consent and old
  sessions intact until `approve` succeeds. Version and consent target bind
  `openSession`. The installer must atomically switch package bytes after consent.
- `checkFilesystem` / `checkClipboard` return either allowed, denied, or a
  `RuntimePrompt`. Display only `pendingPrompts(true)` while foreground. False
  returns no UI prompts. Repeated requests for the same session/target coalesce.
  UI choices call `resolvePrompt(id, 'once'|'session'|'always'|'deny')`.
  Once authorizes the next matching call only; session/always folder grants are
  operation-specific. Denials suppress that target; three denials suppress all
  runtime requests until a new session. Invalidation makes old prompts stale.
- `setRevoked(id, capability, true)` persists denials across approvals, updates
  and rollbacks; re-approval never restores them. Known capability keys are the
  six stable SDK strings, `fs.read`, `fs.write`, `network`, `network.<host>`,
  `secrets`, `secret.<slot>`, `agent`, `clipboard.read`, `clipboard.write`.
  Removing a folder uses `revokeFolder`; both trigger targeted invalidation.
- Publish changed UI state only after awaiting lifecycle mutations. Catch
  `E_CONSENT_STORAGE_FAILED`: engine closes capabilities and returns restricted,
  but no durable write was successful. The host must surface the failure.

Consent data contains manifests, enabled state, revocations, remembered folders,
clipboard grant, declined updates and blocklist reason. It contains no secrets.
Storage corruption or unsupported data restores restricted mode. Do not store
this trusted database in an extension-accessible namespace. Legacy startup must
reload after consent changes; existing `somnia:extensions-changed` event can drive
that reload. The v2 supervisor should use per-extension invalidation, not global
legacy teardown.

## Runtime/service integration gates

`securityServices.ts` implements trusted filesystem, network and agent routing
with injectable host adapters. No default unsafe browser adapter exists.

Filesystem authorization takes canonical paths only from the trusted resolver.
The resolver must use descriptor-relative capability I/O, reject symlink escapes,
pin the checked object, and for new files canonicalize the parent. Do not accept
canonical fields from IPC or just canonicalize then open the original path. Reads
are capped at 512 KiB; writes at 1 MiB. `writeAtomic` must check its combined abort
signal immediately before rename/commit; it must not commit after cancellation.
This is where Rust's OS boundary belongs. String prefix checks are policy only.

The network adapter must disable automatic redirects and ambient cookies/proxy
credentials, enforce HTTPS and honor cancellation/deadline. The service checks
exact hosts and prefixes before each hop, reinjects only that destination's own
secret, refuses POST redirects, caps redirects at five, response at 10 MiB,
timeout at 15 seconds and requests at 60/minute across sessions per extension.
Never log headers or bodies. Secret values may be reflected by the remote endpoint
in its body: the host cannot promise that an authorized server never echoes them.
Headers are not returned to the guest. No ambient Authorization/Cookie headers
can be provided in requests. Preserve proxy ownership of pooled response streams.

`secretSlots.ts` implements Settings-only slot set/delete/list (presence, no read)
with a namespaced keychain adapter. `SecretVault.read` belongs to the trusted
network proxy only, never SDK RPC. Wire both adapters to the same OS keychain
namespace. Disable/blocklist retains slots. Removing data must be an explicit
user action, not a blocklist side effect.

The agent adapter accepts only `host-default`; it must use Somnia Agent's existing
provider keys, billing, quotas and cancellation. Guest sees output text, no keys
or provider settings. Model prompt is capped at 64 KiB and output at 1 MiB.

The expanded services are not wired into the legacy renderer runtime. Do not
expose them until the trusted host integration, descriptor/keychain adapters and
cross-platform security tests pass. A process alone is not an OS sandbox. The
consent engine is usable now without claiming these later adapter gates passed.

## Branch 9 blocklist contract

Only the verified signed-index controller calls `setBlocked(id, reason)`. It
persists disabled+blocked state, closes capabilities, awaits host shutdown, then
notifies. It never removes package data or secrets. Clearing a block does not
re-enable the extension; user must explicitly approve it again. Do not expose a
renderer IPC command with a self-asserted `verified` flag. The controller owns
index signature checking, cache/offline behavior and version matching.

Activity integration remains with `securityActivity.ts` / Rust
`extension_activity.rs`: record sanitized permission decision + target, never
secret values, authorization headers, file contents, agent prompts or responses.
No activity sink is invented in this branch; the coordinator wires the shared
Branch 9 sink at the supervisor/dispatcher boundary.

## Tests and remaining release gates

Focused TypeScript tests exercise closed declarations, native hold timing,
restricted persistence, forged tokens, update expansion, durable revocations,
workspace ceilings, runtime coalescing/denials, scoped folders, network escape
attempts, secret injection, redirect denial, per-extension request quota,
in-flight revocation/cancellation, Settings slots and fail-closed persistence.
Existing manifest/package regressions are included. No new UI pixels are added.

Rust/OS adapters and native installation are release gates, not placeholders
claiming enforcement. Rust toolchain was unavailable in the branch workspace.
Windows canonicalization, descriptor race tests, keychain integration and target
runtime hardening remain for their host owners. Full application typecheck also
requires generating the existing slides-engine Wasm output.
