# Extension v2: code execution without eval or Blob workers

Status: experimental architecture and isolated PoC. Base: `somnia-agent` commit
`1d014e1`. Not a new install format, not catalog support, not a native security
sign-off. Nothing in the v1 manifest, catalog, host, or Tauri CSP is changed.

## Findings in the current implementation

- `runtime.ts` constructs a Blob worker. Both desktop policies have
  `worker-src 'self'`, so this construction conflicts with those policies.
- `workerSource.ts` evaluates manifest text through `new AsyncFunction`.
  Neither production nor development CSP permits JavaScript `unsafe-eval`.
  `wasm-unsafe-eval` is a separate permission, not JavaScript eval permission.
- `host.ts` starts that runtime when `ext.code` is present. Declarative snippets,
  themes, and panels follow separate paths.
- Global deletion in the v1 worker is best-effort hardening, not a complete
  security boundary. Host `connect-src` intentionally permits several services.
- Crucially, a file worker generally does **not** inherit the document CSP.
  Its entry-script response needs its own CSP header. Moving from a Blob to a
  file alone therefore fixes construction but can weaken isolation.

## Options

Relative effort is a planning estimate, not a delivery promise. No native
performance measurements were made.

| Option | Security | Performance | Effort / limitations |
| --- | --- | --- | --- |
| Precompiled ES-module worker as a file | Good only with an isolated extension origin, worker-entry CSP header, verified assets, and a broker. A same-origin file under the current app policy is not enough: network, imports and origin storage remain concerns. | Separate thread; parsed modules and structured-clone messages. Startup and per-worker memory costs; commands avoid blocking UI. | Medium/high: asset resolver, native protocol/headers, integrity, lifecycle, cross-WebView testing. Best target for arbitrary JS commands. |
| Static import into the **host** | Only for audited first-party code. Full app DOM, storage and potentially native bridge authority; permission wrappers do not restrict direct access. | Lowest bridge overhead; parsing and CPU work can block UI. | Low implementation effort but unsuitable for third parties. Static imports **inside a worker** are packaging for option 1, not an independent sandbox. |
| Sandboxed iframe with MessageChannel | Opaque origin with `sandbox="allow-scripts"` and no `allow-same-origin` separates DOM/storage. Restrictive CSP and a private port reduce exposure. It is not a CPU isolation guarantee; frame self-navigation must be considered as an exfiltration path, not assumed blocked by connect-src. Native IPC must be unavailable. | Good for UI panels; synchronous CPU work may contend with UI, depending on renderer/process scheduling. | Medium. Appropriate for panels and bounded UI logic, not a replacement for compute workers. Native inherited-CSP/inline-script behavior needs testing. |
| Tauri command bridge | A typed Rust broker can validate grants and own file access, but is **not a JS execution sandbox**. Running arbitrary JS needs a separate VM/process with no filesystem/network bindings and resource limits. Never grant extension frames general `invoke`. | IPC and serialization overhead; native tasks can run off the UI thread. VM/process startup adds cost. | High/very high for arbitrary JS isolation; useful later for explicit, audited native operations. |

## Recommendation

Keep catalog code blocked until the platform boundary is demonstrated. Use
precompiled ES modules in a dedicated worker for command/compute extensions;
retain opaque-origin iframes for panel UI. Both use a per-instance MessageChannel
and the same host permission broker. No module executes in the host renderer.
Native commands remain host-owned; extensions ask for a small typed operation,
not a generic Tauri invoke or arbitrary path.

The worker needs a dedicated extension origin/protocol with no app cookies,
IndexedDB, cache, or native bridge authority. Origin isolation and worker CSP
are different controls. The resolver must bind the verified package hash,
extension ID, and entry module to an immutable URL. A manifest cannot nominate
an arbitrary URL. Avoid platform asset endpoints that allow unrestricted paths.

Every worker entry response must have a CSP such as:

```text
default-src 'none'; script-src <exact-bootstrap-url> <exact-entry-url>;
connect-src 'none'; worker-src 'none'; object-src 'none'
```

Allowlist any additional module files explicitly, or bundle to one immutable
artifact. CSP URL matching ignores query strings; immutable package URLs and a
closed protocol handler are still necessary. Do not allow redirects. Test the
entire module graph, response headers, and native origin behavior. Dynamic import
is not intrinsically forbidden: it can load an allowlisted module. Arbitrary
self-origin imports are not allowed in this PoC policy.

Never fix this by adding `unsafe-eval` or `blob:` to script-src/worker-src.
Changing the parent policy alone does not secure file workers.

## Protocol and grants

- Host creates the worker and transfers one port. Bootstrap accepts it once.
  Normal traffic uses the private port, not global window messages.
- Bootstrap imports the precompiled entry and calls exported `activate(somnia)`.
  v2 source files must export a function; v1 async source text is not evaluated
  or silently migrated at runtime. Compile/transpile during authoring, not install.
- Host waits for `ready`; premature commands queue behind that handshake.
- Each API call goes through `callApi` with the host's trusted manifest/grants.
  The PoC blocks writes even if a v1 manifest includes project.write.
- Declared command IDs, request IDs, argument size, result size, API rate, startup,
  command completion and disposal are checked. Timeout terminates the worker,
  not merely the Promise. Errors reject outstanding work.
- Production grants should be looked up on **each** call, including revocation;
  this PoC receives one manifest snapshot and relies on its owner to dispose on
  grant changes. Do not mutate that snapshot from untrusted messages.

### Remaining security work

The PoC caps API arguments to 100k JSON characters, results to 1M and calls to
100/second, but these are illustrative numbers, not tuned limits. Structured
clone allocation occurs before JavaScript validates a message. A hostile worker
can still send oversized messages, consume memory, or burn CPU; process quotas,
worker-count caps, scheduling and native hard termination need a separate plan.

The same-origin test fixture is **trusted**, not an arbitrary installed package.
It demonstrates CSP and broker behavior, not storage isolation. No extension
store, native protocol, install/enable UI, event API, AI/Studio/Git/diagnostic
API, or Tauri command was added. This is deliberately not an API_VERSION bump.

A Chrome probe using the actual `panelSrcdoc()` output and
`sandbox="allow-scripts"` reproduced a self-navigation request to a synthetic
`/leak?sample=private-test` URL despite `default-src 'none'`. The server observed
one request. This contradicts the existing panel comment/ADR's blanket
no-network claim. No real private data was used. The parent application CSP was
not applied in this probe; its effect and native behavior remain unverified.
The sandbox still restricts access to the host DOM; this finding concerns
outbound navigation, not a demonstrated native-IPC escape.

Iframe sandboxing does not make every outbound path disappear: test attempted
self-navigation, resource loads, forms, popups, nested frames and messaging to
other frames before calling it a no-network sandbox. MessageChannel does not
stop malicious code from calling APIs it is legitimately granted, and its
bootstrap must not leak the port or accept a replacement from another frame.

## PoC layout and verification

- `phase1/src/lib/extensions/v2/moduleRuntime.ts`: standalone host broker.
- `phase1/public/poc/extension-v2/worker.js`: file module bootstrap.
- `phase1/public/poc/extension-v2/extension.js`: precompiled test fixture.
- `phase1/scripts/extension-v2/browser-test.mjs`: HTTP server with separate
  document and worker CSP; real Chromium test. Assets are not wired to the app.

```sh
cd phase1
npm ci --ignore-scripts
node scripts/extension-v2/browser-test.mjs
# Optional: CHROME_PATH=/path/to/chromium node scripts/extension-v2/browser-test.mjs
npx tsx scripts/extension-v2/panel-navigation-test.mjs
npx tsx --test src/lib/extensions/*.test.ts
```

Verified in Linux Google Chrome: early-command handshake, file read and notice,
permission denial, undeclared command denial, eval denial, same-origin fetch
denial, unlisted dynamic-import denial, zero requests to the leak endpoint,
activation timeout, command timeout and worker termination, worker syntax error,
disposal, and rejection of Blob asset URLs. There is no visual UI change.

Full TypeScript check at the base checkout is blocked by the absent generated
`slides-engine/pkg/somnia_slides.js`. Check the new module independently or build
that engine first. The isolated strict TypeScript check passed:

```sh
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext \
  --moduleResolution Bundler --lib ES2022,DOM --strict --skipLibCheck \
  src/lib/extensions/v2/moduleRuntime.ts
```

All 29 existing extension unit tests passed. No desktop installer was built or tested. Required release
matrix: Windows WebView2, macOS WKWebView, Linux WebKitGTK, then supported browsers.
Use negative tests for fetch, WebSocket, import, nested Worker, origin storage,
IPC, native paths, navigation, resource exhaustion, and permission revocation.

## Evidence and assumptions

Source inspection: the four requested files at the base commit; `api.ts` and
`types.ts` for the existing broker and manifest contract.

External references inspected during this design:

- [MDN: workers and their own CSP](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
- [Tauri: CSP configuration and wasm-unsafe-eval](https://v2.tauri.app/security/csp/)
- [Tauri: capability boundaries](https://v2.tauri.app/security/capabilities/)
- [MDN: iframe sandbox tokens](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)

Assumptions: v2 should run local, offline JavaScript; worker modules can be served
as real files by a controlled native protocol; no third-party network access is
required; command handlers can fit an async RPC model. The native protocol and
its response headers are **proposed**, not proven available in this checkout.
