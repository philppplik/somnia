# Native `somnia-ext` scheme (Tauri core)

Status: implemented in `phase1/src-tauri/src/ext_scheme.rs` and `desktop.rs`. **Not verified on a native engine.** Unit tests cover routing, headers, single-use nonces and drift against the TS sources; the checklist below is the release gate.

## Why

Under the production app CSP the extension worker (Blob URL), its `AsyncFunction` bootstrap and srcdoc panels (inline bridge) are blocked. Instead of weakening the app CSP, the Rust core serves worker and panel documents as their own responses, each with its own CSP header.

## URL contract

| URL (macOS / Linux) | Windows form | Response |
| --- | --- | --- |
| `somnia-ext://worker/<ext-id>` | `http://somnia-ext.localhost/worker/<ext-id>` | Worker bootstrap JS (`ext/worker.js`, kept identical to `workerSource.ts` by a Rust test) |
| `somnia-ext://worker/<ext-id>/host?n=<nonce>` | same host, `/worker/<ext-id>/host?n=` | Trusted same-origin relay document (fallback, see below) |
| `somnia-ext://panel/<ext-id>/<panel-id>?n=<nonce>` | same host, `/panel/...` | The panel document registered by the frontend, served verbatim |

Ids must match `[A-Za-z0-9._-]{1,64}` and not start with `.`. Only `GET`. No redirects, no filesystem access, bounded in-memory table.

## Commands (editor capability, frontend only)

- `ext_panel_open(extId, panelId, document)` -> `{ url, session }`. `document` is the full HTML the frontend built (e.g. `panelDocument(html, null)`). `url` ends in `?n=<nonce>`; the frontend appends `#<token>` itself. The nonce is **single use**: the first request consumes it; a reload, history navigation or second frame gets 403.
- `ext_worker_open(extId)` -> `{ url, session }` for the relay document (single use).
- `ext_worker_url(extId)` -> base-correct bootstrap URL for `new Worker(url)` (no nonce).
- `ext_close(extId, panelId?)` revokes one panel, or everything of an extension. Call on dispose, disable, replace, uninstall and panel unmount.

## Response headers

Worker: `default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`.
Panel: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts`. The `sandbox` directive forces an opaque origin even if an embedder forgets the iframe attribute; `allow-same-origin` is never granted.
Relay: `default-src 'none'; script-src 'unsafe-inline'; worker-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`. The relay is deliberately not sandboxed: a Worker URL must be same-origin with its creator, so the trusted relay (it runs no extension code) starts the worker from the same scheme origin.
All: correct `Content-Type`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`. No CORS headers. Error bodies are empty.

## App CSP change (minimal, not "unchanged")

Only two directives gain sources, in `tauri.conf.json` (`csp` and `devCsp`): `worker-src 'self' somnia-ext: http://somnia-ext.localhost` and `frame-src 'self' blob: somnia-ext: http://somnia-ext.localhost`. `script-src`, `connect-src` and the rest are untouched; no `unsafe-eval`, no `http:`/`https:`. The alpha/Windows/macOS override configs contain no CSP.

## Native navigation guard

A Tauri plugin `on_navigation` callback refuses any navigation of a webview into `somnia-ext` / `somnia-ext.localhost`. Whether this callback is invoked for **sub-frames** differs per engine and is not assumed; frame navigation is also limited by single-use nonces (a navigated-back document cannot be re-served) and by the host-side session binding in `panelSession.ts`. Treat sub-frame navigation denial as unproven until the checklist passes.

## Capabilities

`capabilities/editor.json` is `local: true, windows: ["main"]` with no `remote.urls`. The scheme is not listed, so frames and workers on it must get **no** IPC. The four new commands are in the editor capability only. This must be proven by raw IPC calls from panel, worker and relay on each OS (below), not assumed.

## Verification (release gate)

Linux (WebKitGTK), Windows (WebView2) and macOS (WKWebView), production build (`npm run tauri build`), with devtools/remote inspection and an independent request observer (e.g. a local HTTP listener plus `mitmproxy`):

1. Install a benign extension with worker + panel. Worker activates, command runs, panel renders and its inline script calls `window.somnia.*`. In the app window `eval('1')` and an injected inline script still throw CSP errors.
2. Inspect real response headers for all three URL kinds (devtools Network). Exactly one `Content-Security-Policy` header, equal to the values above. On Windows check the URL is `http://somnia-ext.localhost/...`.
3. Worker startup: confirm `new Worker('<ext_worker_url>')` from the app. If it throws `SecurityError` (expected on most engines), switch the loader to the relay (`ext_worker_open`, iframe without `sandbox` attributes, `frame-src` as configured) and confirm the Worker starts inside it. If neither starts, execution must fail closed with a visible error.
4. Worker probes (independent observer must see nothing): `fetch`, XHR, WebSocket, EventSource, `navigator.sendBeacon`, `importScripts`, dynamic `import()`, nested `Worker`, `caches`, IndexedDB, BroadcastChannel.
5. Panel probes: remote img/font/css/script, form submit, nested frame, `top.location`, `location.href = 'https://example.com'`, `<meta refresh>`, link click, `window.open`, download. Record what the engine blocks natively vs. what only the host guard stops.
6. Raw IPC from panel, worker and relay (not only `window.__TAURI__`): on Windows run `window.chrome.webview.postMessage` and the Tauri `ipc.localhost` fetch; on macOS/Linux `window.webkit.messageHandlers.ipc.postMessage`. Try `read_file`, `open_external`, `log_tail`, `ext_panel_open`. All must be denied. Tauri injects its init scripts into sub-frames on Windows; verify the denial instead of assuming it.
7. Reload the panel frame (`location.reload()`), navigate it to its own URL and use history back: the document must not re-serve (403) and the bridge must have no authority.
8. Call `ext_close` then request the old URL: 403. Request `somnia-ext://panel/../x`, `%2e%2e`, `%2f`, backslashes, POST/PUT: 404/403/405, no body.
9. Flood: 10k `postMessage` calls and an infinite loop in a worker; app stays responsive (termination policy is outside this change).

Record per OS: engine version, actual header, effective origin, blocked-request log, IPC result.
