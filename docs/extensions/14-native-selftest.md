# Native extension self-test and CSP testing

Extensions run in two places: a Worker (code) and a sandboxed iframe (panels). Both are served by the app through the
`somnia-ext://` scheme with a per-response Content-Security-Policy. This page describes how that is verified.

## Layers

| Layer | What it proves | Where |
|---|---|---|
| L1 unit | CSP parsing, policy conformance checks, self-test evaluation | `src/lib/extensions/cspPolicy.test.ts`, `selftest.test.ts` |
| L2 browser harness | Worker and panel actually run under the real prod host CSP; network, DOM and form paths are blocked; navigation does not keep API authority | `tests/ext-csp-scheme.spec.ts` (`npx playwright test -c playwright.ext-csp.config.ts`) |
| L3 native | The same, inside the packaged app on Windows, macOS and Linux, including native IPC denial | `src/lib/extensions/selftest.ts` + `scripts/ext-selftest/` |

CSP alone does not prove IPC denial. L2 models the scheme as a same-origin path (Chromium cannot intercept custom schemes in
`page.route`), so only L3 covers wry's origin rewriting and per-platform subframe behaviour.

## Expected policies

- Worker: `script-src 'unsafe-eval'; connect-src 'none'` (plus `default-src 'none'`). The bootstrap uses `AsyncFunction`.
- Panel: `default-src 'none'; script-src 'unsafe-inline'; form-action 'none'; base-uri 'none'`.
- Host: `worker-src` and `frame-src` allow `somnia-ext:`; no `unsafe-eval` on the host; no broad `http(s):` in `connect-src`.

Override the policies under test in L2 with `SOMNIA_EXT_WORKER_CSP` and `SOMNIA_EXT_PANEL_CSP`.

## Findings the tests encode

- A blob worker and a `srcdoc` panel are blocked by the prod CSP (control tests reproduce the bug).
- The worker's global hardening (`fetch = undefined`) is best effort: `WorkerGlobalScope.prototype.fetch` is still reachable. Only the CSP stops it.
- A form post from the panel is stopped by the iframe sandbox (no `allow-forms`) before `form-action` applies, so no violation event is fired. Never add `allow-forms`.
- `form-action` and `base-uri` do not stop `location.href`, links or meta refresh. The frame's `window` object survives navigation, so a bridge that only checks `event.source === iframe.contentWindow` keeps granting API access to the navigated document. The harness test `KNOWN-BAD: legacy source-only bridge` documents this (it is marked as an expected failure). Panel navigation must be denied natively and the bridge session invalidated on any later load.
- A Worker cannot be created from a different origin. If the app origin and the scheme origin differ, `new Worker('somnia-ext://...')` throws in Chromium-based and WebKit webviews. L3 covers this; L2 cannot.

## L3 self-test

Gate: `SOMNIA_EXT_SELFTEST=<out.json>` and a build with the `ext-selftest` cargo feature. Without the feature the variable is not read.
When enabled, the app starts a probe extension (worker + panel), writes a JSON report, and exits 0 (green), 1 (failures) or 2 (cannot write).

Report fields per probe: `started`, `api_roundtrip`, `network_blocked`, `dom_blocked`, `attempts` (fetch, xhr, websocket, importScripts / img, form, base, script), and `violations` (the `securitypolicyviolation` events).
The report also has `navigation.targets`: for each of same-app, another scheme document, a redirect chain into the scheme, a blob URL and an external https URL, whether the panel navigated and whether a host API call from the resulting document was denied.

Wiring in the app (not part of this patch, needs the scheme code): implement `SelftestPorts` (start the probe worker, mount the probe panel, navigate it, write the file, exit), and call
`runExtSelftest(env, ports)` once at startup behind the cargo feature. Set `SOMNIA_EXT_SELFTEST_EVIL` as the probe's target host so the CI wrapper can count connections.

CI: `scripts/ext-selftest/check.mjs -- <binary>` starts a local listener, runs the packaged app, validates `out.json`, and fails if the listener saw any connection.
The matrix draft is in `scripts/ext-selftest/workflow.draft.yml` (Windows, macOS, Ubuntu with xvfb).
