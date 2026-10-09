# Extension native CSP transport: security review

Date: 2026-10-09. Baseline: `1d014e1` (Tauri 2.12.1, Wry 0.57.0 in
`phase1/src-tauri/Cargo.lock`). This is a source review of a proposed
`somnia-ext://` transport, not a review of implemented protocol-handler code.
No native runtime test was performed. It does not approve catalog worker code.

## Decision

Separate response CSPs are the right direction for repairing native extension
execution without putting JavaScript `unsafe-eval` or `unsafe-inline` into the
production app policy. The proposal is **conditional**, not a proven sandbox.
The worker creation/origin design, frame navigation, native IPC exclusion and
protocol route/lifetime checks must pass the tests below before claiming
isolation. Do not silently fall back to host-origin eval or a permissive Blob
worker when a native engine rejects the scheme.

## Evidence at the baseline

Paths below are relative to `phase1/` unless prefixed with `docs/`.

| Evidence | Consequence |
| --- | --- |
| `src/lib/extensions/runtime.ts:27` creates a Blob Worker | The worker inherits its creator's CSP; there is no worker response header here. |
| `src/lib/extensions/workerSource.ts:4,16` removes selected globals and uses `AsyncFunction` | Global removal is best effort, not a network/storage authority boundary. The async-function constructor needs JavaScript eval permission. |
| `src-tauri/tauri.conf.json:33-34` sets `worker-src 'self'`, no JavaScript `unsafe-eval`, and broad `ws: wss:` in `connect-src` | Native Blob loading/eval is not enabled by this policy. If a Blob worker runs in another environment, its inherited CSP does not promise no network. `wasm-unsafe-eval` is not JavaScript eval permission. |
| `src/lib/extensions/panelHtml.ts:4` uses meta CSP, no `form-action` or `base-uri` | Its restrictive fetch directives do not by themselves prohibit the frame's own navigation. |
| `src/components/ExtensionPanel.tsx:11-18` checks `e.source`, calls the current effective manifest and uses `sandbox="allow-scripts"` | The frame is opaque-origin, but WindowProxy identity is not a document/lifetime identity across navigation. |
| `src/lib/extensions/api.ts:4-24` checks permissions, operation envelope and bounds | Host mediation is useful but does not sanitize project output or authenticate an extension publisher. |
| `src/lib/extensions/host.ts:19`, `src/components/ExtensionPanel.tsx:14` store values under `somnia.ext.<id>.<key>` | This is host-mediated namespacing, not storage separation for arbitrary same-origin JS. |
| `src/lib/extensions/registry.ts:6-20` replaces manifests by id; enablement and revocations are id-based | Local replacement can inherit enabled status and use newly declared, unrevoked permissions. Removal does not clear the revoked-permission record. |
| `src/lib/extensions/catalog.ts:33,49-61` rejects redirects, checks digest/identity, rejects worker code and disables replacements | Preserve these safeguards. A hash binds ZIP bytes to the chosen index entry, not to a trusted publisher. |
| `src/lib/extensions/host.ts:21-23`, `packages/editor-core/src/index.ts:222` insert snippet/operation HTML into project source | Declarative snippets and write operations can plant active content in exported/saved projects. Undoability is not content safety. |
| `src/lib/livePreview.ts:23-37`, `src/components/LivePreview.tsx:7-17` support opt-in project scripts | Do not claim all previews are script-free. Script approval is remembered by project name, not by each newly inserted extension change. |
| `src-tauri/capabilities/editor.json` grants many commands to local `main`; `src-tauri/build.rs:3-96` lists app commands | ACL enforcement exists, but this configuration alone does not establish that the proposed scheme/subframe has no native command access. |

## Origins, credentials and storage

1. A new scheme is not the app origin under ordinary origin rules. Tauri/Wry
   map custom schemes differently by platform: macOS/Linux use the custom
   scheme and Windows uses an HTTP or HTTPS synthetic host. Record the actual
   effective URLs and origins, rather than treating `somnia-ext://` as a
   portable literal CSP source or capability URL.
2. Keep panels in `sandbox="allow-scripts"` only. Never add `allow-same-origin`,
   forms, popups, downloads or top-navigation grants. The opaque panel cannot
   directly read the app DOM, document cookies or localStorage under normal
   sandbox rules. This is not proof that navigation requests send no cookies,
   that native IPC is absent, or that autofill is harmless; test those separately.
   Synthetic hosts can be different origins while still sharing a WebView
   profile or cookie-domain/site scope. Do not infer cookie isolation from
   different paths/host labels; test effective hosts and cookie behavior.
3. A dedicated Worker has no DOM or document.cookie, but an unsandboxed scheme
   context is not necessarily opaque. Putting every extension under one
   scheme/host and different paths does not provide origin-level separation.
   Storage APIs, communication channels and any trusted bootstrap document at
   that origin need explicit isolation. Removal of globals is defense in depth.
   Do not serve secrets or other extensions' documents/code at predictable paths.
4. No extension response should set cookies or reflect request Cookie or
   Authorization headers. Avoid copying the app profile's values or credentials
   into extension documents. Storage granted through the host must stay bound
   to the active extension id, never an id supplied by the message.
5. CSP controls fetch destinations, not publisher identity or all browser APIs.
   `connect-src 'none'` covers fetch/XHR/WebSocket/EventSource/beacon, not every
   possible exfiltration mechanism, including navigation or permitted output.
   Audit WebRTC and any newly exposed platform APIs. Do not promise total
   no-network solely from this directive.

## Worker startup is a design gate

`new Worker(url)` normally requires the worker script to be same-origin with
its creating document. Merely adding a separate origin to `worker-src` or
returning CORS headers does not remove that requirement. Replacing line 27
with `new Worker('somnia-ext://...')` therefore needs a demonstrated native
engine exception or a different startup architecture.

One candidate is a **trusted** bootstrap document at the extension origin that
creates a same-origin response-served Worker and relays a narrowly scoped
MessagePort to the app. This is not implemented or approved here. The bootstrap
must not execute extension HTML/code itself, must have no app-origin or native
IPC privileges, and must not let a hostile worker choose routing identities or
ports belonging to another extension. Do not use a Blob/importScripts wrapper
as evidence of the remote script's response CSP: Blob workers inherit the
creator's policy, and imported script headers are not a substitute for the
entry worker's execution policy. The entry response must be tested directly.

## Header contract

Use an enforcing `Content-Security-Policy` **response header**, not
`Content-Security-Policy-Report-Only` and not a worker HTML meta tag. Headers are
host-owned; extension payloads must not supply/replace them. Inspect the actual
response after scheme rewriting and Tauri processing. Multiple enforcing
policies intersect; they do not override each other. Unexpected injection of
the app policy can therefore still break eval/inline panels.

Suggested worker entry policy:

```text
default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'
```

`unsafe-eval` permits the existing AsyncFunction bootstrap but grants no script
URL source. Keep external imports/dynamic imports and nested workers denied.
If the transport requires further sources, justify exact routes before adding
them. No `self`, `blob:`, `data:` or scheme-wide script source by default.

Suggested panel response policy, preserving the current inline/data features:

```text
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'
```

`unsafe-inline` deliberately lets hostile panel JavaScript execute inside the
sandbox, including inline handlers. Neither this policy nor `base-uri` and
`form-action` prohibits `location.href`, hyperlinks or meta refresh generally.
Do not cite unsupported `navigate-to` as the solution. A response `sandbox
allow-scripts` directive is useful additional protection for panels opened
outside their intended iframe, subject to native compatibility testing. It is
not a substitute for the parent iframe sandbox or navigation control.

Also return `Content-Type: text/javascript; charset=utf-8` for workers and
`text/html; charset=utf-8` for panels, `X-Content-Type-Options: nosniff`,
`Cache-Control: no-store` and `Referrer-Policy: no-referrer`. Error responses
must be non-executable, carry restrictive headers and reveal no private paths.
No wildcard credentialed CORS, no redirects, no arbitrary MIME selection and
no native resource proxy. CSP violation reporting endpoints are themselves
network destinations and must not include private payloads.

The app may require narrowly scoped worker/frame load allowances for the
chosen transport. Document these as explicit load changes, not "CSP unchanged".
Keep its production script policy free of JavaScript `unsafe-eval` and
`unsafe-inline`; never add `http:`, `https:`, wildcard scheme grants or broaden
its existing `connect-src` to make extensions work.

## Navigation, scheme dispatch and bridge authority

- Preserve the app's restrictive `frame-src`. At the baseline it is `'self'
  `blob:`: the panel-CSP omission alone is **not** a demonstrated arbitrary HTTP
  exfiltration exploit. The proposed scheme allowance changes reachable targets.
- Deny extension frame navigation outside its initial host-issued route,
  including app-origin, remote, blob/data, nested scheme and external-handler
  destinations. Check meta refresh, user-clicked links, location assignment,
  redirects and history/back/forward. Native navigation callbacks must be
  proven to cover subframes on each engine; their existence does not prove it.
  A JS load listener cannot undo an already-issued network request.
- Do not retain host API authority just because `e.source` still matches a
  navigated frame's WindowProxy. Bind communication to a host-created instance
  and generation, invalidate it on navigation/replacement/disable/dispose, and
  reject stale replies. Authenticate MessagePort bootstrap before transferring
  privileges. Tokens visible to hostile panel JS are not a network sandbox.
- Register the scheme only inside the app; do not register an OS-wide URL
  handler as part of this fix. Package ids must not choose handlers or hosts.
  Wry documents last-registration-wins for duplicate names, so keep a single
  host-owned registration and test plugin/handler collisions.
- Parse canonical URLs exactly. Reject unsupported methods, userinfo, ports,
  query/fragment ambiguity, encoded traversal/slashes, double decoding,
  backslashes, extra path segments and unknown/stale route tokens. Keep a
  bounded in-memory route table; never resolve extension URLs against the
  filesystem, fetch a URL in Rust, or accept a caller-selected extension id.
- Revoke routes on removal/disable/replacement and bound sizes/counts/lifetime.
  A random route token reduces guessing but is not authorization once a hostile
  extension learns it. Deny access from unrelated frames/workers/webviews.
- Test direct raw IPC, not only `window.__TAURI__` absence. Windows initialization
  scripts can be injected into subframes. Verify filesystem/provider/key,
  open-external, window and event commands are denied from every extension
  context. Never grant the scheme remote/local editor capability for startup.

## Existing v1 findings stay open

- **Broad WebSocket policy:** app `connect-src ws: wss:` remains an app-level
  issue. A correctly served worker's `connect-src 'none'` would separate it
  from that policy, but the scheme does not fix app XSS or permissive web/Blob
  fallback execution. Test the fallback and document it separately.
- **Re-install permission carry-over:** local ZIP/folder/JSON paths use ordinary
  `installExtension`; enabled ids and newly declared unrevoked permissions can
  carry over. A scheme CSP does not fix this. Disable local replacements and
  require renewed review of identity/code/permissions before activation; bind
  consent to package content/version, not only a self-declared id. Catalog
  replacements already explicitly disable. Uninstall/reinstall revocation and
  stored-data retention need an explicit policy.
- **insertHTML supply chain:** `project.write` is broad source-edit authority.
  Raw markup can persist scripts, event handlers, links, forms and remote
  resource references. Normal preview restrictions do not sanitize exports or
  later user-enabled live preview. Declarative HTML snippets take a user-invoked
  insertion path without calling `callApi` or checking `project.write`. Review
  them as active output, not "no code". Add source/diff review and warnings;
  any sanitization/restriction must be an explicit compatibility decision.
- **Denial of service:** the five-second command timer rejects a promise but
  does not terminate the worker (`runtime.ts:24`). Infinite panel loops,
  message floods and storage key floods are not solved by CSP or per-value caps.
  Bound queues/routes/aggregate storage and isolate or terminate offenders.

## apiVersion

Retain apiVersion 1 for a transport-only fix that preserves methods, permission
meaning and supported contributions. Existing validation already requires the
exact `API_VERSION` (`manifest.ts:14`, `types.ts:2`). Do not create a "trusted"
version or let a manifest opt out of isolation. Gate execution on verified
runtime capabilities: if response CSP, startup or IPC exclusion is unsupported,
fail closed with a visible error. Reject unknown versions as before.

If sanitizing/removing supported HTML, removing operations or changing
permission semantics is part of the follow-up, treat it as a separately
versioned API/contract decision. A version bump alone is neither consent nor
an isolation boundary. Keep catalog worker admission disabled until a separate
security review passes; this transport repair is not that admission decision.

## Release acceptance matrix (not yet executed)

Run in production builds on Windows WebView2, macOS WKWebView and Linux WebKitGTK,
and test the web fallback separately. Capture actual response headers, effective
origin, blocked request logs and IPC denials. Browser-unit tests cannot certify
native scheme semantics.

1. Benign worker activation/command/API and panel rendering/inline scripts work;
   production app `eval` and inline script probes stay blocked.
2. Test worker fetch, XHR, WebSocket/ws/wss, EventSource, beacon, WebTransport,
   importScripts, dynamic imports, nested workers, caches/IndexedDB/BroadcastChannel
   and available WebRTC paths with an independent request observer.
3. Panel probes cover remote images/fonts/CSS URLs/scripts, forms, nested frames,
   top navigation, popups, downloads, meta refresh, links and JS self-navigation.
   Check direct, redirected and rewritten URLs, not only initial source strings.
4. Read app DOM/cookies/localStorage, attempt cross-extension storage and route
   access, and invoke raw native commands from panel, worker and bootstrap.
   Assert denial with no credential or project-secret bytes reaching any sink.
5. Send forged/stale bridge messages before initialization and after frame
   navigation, disable, revoke, replacement and uninstall. Ensure source,
   instance, generation and effective permissions all match.
6. Fuzz malformed URLs/methods/headers and stale tokens. Check no redirects,
   path reads, host forwarding, executable errors or duplicate registration.
7. Reinstall an enabled extension with extra permissions via each local path;
   confirm the existing carry-over failure until a separate fix lands. Verify
   catalog replacements remain disabled and worker packages remain rejected.
8. Insert malicious project markup/snippets. Inspect saved/exported source and
   opt-in live preview so restricted runtime does not hide persistent output risk.
9. Flood commands/messages/routes/storage and run an infinite loop. Record
   resource limits and recovery separately from network isolation.

## References

These sources establish platform/CSP behavior; repository evidence establishes
Somnia's current code. They do not replace native testing.

- https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/worker-src
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-src
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/form-action
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe
- https://html.spec.whatwg.org/multipage/browsers.html#the-windowproxy-exotic-object
- https://docs.rs/tauri/2.12.1/tauri/struct.Builder.html
- https://docs.rs/wry/0.57.0/wry/struct.WebViewBuilder.html
- https://v2.tauri.app/security/capabilities/
