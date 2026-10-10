# SDK v2 runtime integration

This branch implements the host-side SDK 2.0.0 contract, a bare-Wasm browser
worker, and an explicit legacy compatibility lane. It does not enable executable
Store extensions or claim desktop process isolation. Packages use `.somniax`
and the root manifest is `somnia-extension.toml`.

## Implemented modules

- `contracts/v2/api.ts`: typed plain-data API, seven editor operations, independent
  SDK/protocol versions and stable error codes.
- `v2/rpc.ts`: closed envelopes, strict duplicate-key JSON parser, generation
  checks, prototype/depth/number limits, UTF-8 1 MiB budgets, incremental
  little-endian desktop pipe framing.
- `activation.ts`: explicit event matching, current-context rechecks, bounded
  workspace-index glob matching, two-slot queue with user-action priority.
- `supervisor.ts`: dormant/activating/active/faulted state machine, one shared
  activation promise, launch limits, handshake, five-second activation/command
  deadlines, targeted termination, session-generation invalidation and live
  capability checks. No automatic fault restart.
- `broker.ts`: closed method router, live permission/trust/virtual-workspace
  checks, subscriptions, callback registration, argument/result schemas,
  32-call concurrency, 100 calls/s, 10 edits/s, read/storage/frame budgets.
- `contributions.ts`: staged all-or-nothing contribution publication; concrete
  native data store; closed `when` evaluation without JavaScript evaluation.
- `v2/editorService.ts`: actual EditorProject transaction adapter, conservative
  monotonic revision snapshots, atomic rollback, cancellation and undo.
- `v2/sdk.ts`: guest-local callback maps, typed asynchronous API, subscription
  disposal and rejection of pending calls on disconnect.
- `v2/wasm.ts`, `wasmWorker.ts`, `browserWasmTransport.ts`: preflight rejects
  unbounded/over-128-MiB/shared/memory64 memory, WASI/other imports and Wasm start
  functions. Require one `somnia.emit` import and exact ABI export signatures.
  Only the trusted host worker module is loaded. Guest bytes are instantiated
  with the single `emit` import; no guest JS/DOM/network execution. Pointer
  copies are bounds-checked. Async emit frames flush after a guest turn, with
  no synchronous re-entry. The outer transport terminates on turn deadlines.
- `legacy/adapter.ts`, `legacy/migrate.ts`: explicit parser/API lanes, renewed
  local/developer execution gate, new-file migration with literal-dollar
  snippet escaping, separate theme assets and provenance notes.

## Wire bootstrap and runtime gate

The factory receives identity, immutable package digest, generation and selected
SDK version from the host. It must never derive authority from guest frames.

1. Host sends `bootstrap` with SDK version, supported protocols and package digest.
2. Guest sends notification `hello` with `protocolVersions: [1]`, `runtime`, and
   `abi: "somnia-json-1"` for Wasm.
3. Host sends `activate` with extension ID and SDK version.
4. Guest registers callbacks through the broker, then sends `ready`.
5. Commands carry local `callbackId` and JSON `args`; responses are schema-checked.
6. Host delivers `event` notifications with callback ID and permitted snapshot.

An activation timeout terminates only that extension. Faults require explicit
restart. Disable, update, workspace closure, or permission/trust changes call
`stop`/`policyChanged`, revoke capabilities first and advance the generation.
Late replies cannot revive the old session or retry a write.

Browser host capabilities advertise **Wasm only**. QuickJS-in-Wasm and native
QuickJS/Wasmtime sidecars are not built here. Unsupported JS/desktop execution
fails `E_INCOMPATIBLE_API`; there is no unrestricted Module/Blob/Node fallback.
The pre-existing experimental `ModuleRuntime` is not wired into this v2 lane.
Desktop has a usable pipe codec, not a working process factory. A future sidecar
must supply OS-specific child cleanup, engine interruption, environment
allowlists, RSS controls and target certification before advertising support.

## Integration contract

Create `ExtensionSupervisor` with:

- Current app/SDK/protocol/runtime capabilities, including exact proposal revisions.
- A `RuntimeFactory` bound to a verified package receipt/digest.
- Current interactive editor/workspace/selection context and live consent policy.
- Per-extension broker services, never a shared unnamespaced storage service.
- A safe diagnostic callback. UI should translate stable error codes, not expose
  guest stack traces or document content.

`browserWasmFactory(resolveEntry)` resolves entry bytes asynchronously by
**digest + inventory-relative entry** and copies them. No remote URL, arbitrary
OS path, mutable download location or manifest-selected loader is accepted.
The package importer/cache must supply this resolver. Large assets are not
converted to localStorage or JSON/base64. Async >2 MiB import/cache persistence
belongs to the package asset-pipeline branch; this branch does not create an
isolated IndexedDB/native cache or wire the existing v1 importer.

Register contributions after validation/consent, before executable activation.
`ContributionRegistry` calls a native sink's validator on every copied asset
before starting a publication transaction. `NativeContributionStore` supports
static snippets, syntax-color themes and information-only native view trees.
For UI theme tokens, contrast checks, interactive command-aware native views,
CodeMirror insertion and native panel rendering, provide the actual app adapter.
No HTML is inserted into Somnia's React tree. Webviews must be routed through
the isolated panel bridge, not treated as a native view.

The editor service **must** implement `commit(request, signal)` as one undoable
transaction, validate all base revisions at the actual commit point, and check
cancellation/live authorization immediately before that point. A completed
commit returns its transaction ID even if cancellation arrived afterward.
Never implement this by repeatedly calling individual app operations. There is
no direct Save API; normal saving/conflicts remain host-owned. `createEditorCommit` supplies this behavior for an `EditorProject`; its project-wide
monotonic revision intentionally invalidates reads on unrelated project edits.
The current React app store must expose the actual project to this adapter; the
service interface alone does not wire it automatically.

Events must come from host-owned subscription callbacks; send project paths and
revisions rather than contents. Selection activation is coalesced to 10/s and
uses a current snapshot. Context `when` affects command availability, never
permission grants. Permission policy has no network/secrets/agent permission
fallback. Optional security declarations added by a companion branch must be
preserved in its manifest contract and enforced by its own policy adapter;
this runtime neither grants nor interprets those extra rights.

## Legacy migration

`migrateLegacy` returns a new manifest and file map. The caller writes a **new**
folder, never edits an installed package. Developers supply tested app/API
ranges, license and description. Generated inline-code wrappers require manual
v2 API review, dependency inventory and tests. Legacy panels are script-free
until their messaging is migrated. Legacy string reads and numeric write
results remain in the v1 adapter only. An old saved enabled flag is not renewed
execution consent. Stable Store execution rejects the legacy lane.

No stability/support-removal date is invented by this implementation. Publish
the actual SDK v2 stable date and v1 removal window before making that promise.

## Validation

Run `npx tsc -p tsconfig.extension-runtime.json` and
`npx tsx --test src/lib/extensions/v2/runtime.test.ts` from `phase1`.
Tests cover real minimal Wasm compilation, ABI rejection, lifecycle races,
launch quotas/priority, duplicate-key/prototype/spoofed-generation frames,
legacy semantics, live revocation/trust, storage limits, command schemas and
atomic contribution publication. Run `node scripts/test-extension-wasm-browser.mjs` for a real Chromium worker
smoke test (normal turn, runaway timeout and pointer rejection). Production
WebView CSP behavior and OS engine certification are still target-level release
gates, not implied by these tests. The old v1 App effect still tears down every
legacy extension on registry change; v2 uses targeted supervisor sessions.
Legacy worker disposal/crashes now terminate and reject pending work, but that
old global React integration is not rewritten by this branch.
