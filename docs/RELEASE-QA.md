# Release QA gate

This gate checks the release shell against the real frontend. It does not claim that browser tests prove native window behavior or WASM codecs.

## Run locally

From `phase1/` after `npm ci`:

```sh
# Uses Playwright Chromium by default; use an installed Chrome when needed.
CHROME_PATH=/usr/bin/google-chrome npx playwright test -c playwright.release-smoke.config.ts
npx tsx --import ./scripts/test-css-register.mjs --test \
  src/lib/tabScope.test.ts src/lib/updates.test.ts src/lib/releaseVersion.test.ts \
  src/lib/shell/heroAction.test.ts src/lib/extensions/nativeScheme.test.ts \
  src/lib/extensions/panelSession.test.ts
# Diagnose flakes rather than hide them with retries:
npx playwright test -c playwright.release-smoke.config.ts --repeat-each=3
```

The smoke config runs Vite directly because no studio engine is opened. It does not create fake WASM packages, replace engines, use keys, start remote servers, push commits or start Actions jobs. Release and catalog requests are intercepted with local test data. The extension panel is installed through the real app's review UI and uses the real browser permission bridge.

## Required evidence

| Area | Gate evidence | Remaining native/engine evidence |
| --- | --- | --- |
| All ten studios | Selected studio, shell present, registered hero command, accessible name, empty-work disabled state, no page errors, screenshot | Enabled hero actions with real DOCX/XLSX/PPTX/photos/audio/video engines |
| Shell | Ten studio controls, header and per-studio snapshots attached to test results | Frameless chrome, window rounding, native menus and folder access |
| Settings | Motion preference changes live, closes and survives reload | Native-only settings |
| Studio tabs | Explicit studio choice moves only the active document; background Code tab does not appear in Vector; tab closes | Media-kind intake and multiple real engine documents |
| Extension panel | Real local install, permission approval, sandbox, allowed project read, denied notification, unmount | Native scheme and WebView2 |
| Update pill | Completed-check wait, newer stable link, disable-check removes pill | Signed installer/updater download, install and restart |
| SemVer | Numeric beta ordering, feed permutations, draft exclusion, equal build metadata, full version/channel logic | Published feed and platform installer |

The tab ownership contract is document-based: clicking a studio intentionally records that studio for the active tab. Do not assert that the active tab disappears when the user changes studio. Background tabs still belong only to their recorded studio.

## Windows URI regression

`phase1/src-tauri/src/ext_scheme.rs` includes `windows_panel_uri_roundtrip_and_replay_denial` and `windows_worker_uri_roundtrip_and_revocation`. These use the actual registry and URI splitter, not an HTTP fixture. Both Windows-rewritten and native URI forms must consume the same single-use document entry; the reply must retain the expected CSP and revocation must deny access.

Run on a toolchain-enabled runner:

```sh
cd phase1/src-tauri
cargo test windows_panel_uri_roundtrip_and_replay_denial
cargo test windows_worker_uri_roundtrip_and_revocation
```

A passing Rust test is still not a WebView2 test. On a Windows build install a read-only panel, open it, verify a permitted API roundtrip and denied unapproved API, then disable it and verify the frame goes away. Reopening must mint a fresh session. Record build tag, OS, WebView2 version and result. Do not declare this native gate green from Linux/browser evidence.

## Flake and stale-test audit

These are risk indicators from source inspection, not confirmed flaky failures:

- `tests/update-pill.spec.ts`: an 800 ms delay can assert absence before the async check finishes. The new gate waits for `somnia.updateCheck.last.result` instead.
- `tests/update-pill.spec.ts`: fixed `12.2.0-beta.10` stops being newer once the app reaches that release. The new positive smoke derives a higher major from `somniaRelease`.
- `tests/shell.spec.ts` and `tests/shell-layout-m3.spec.ts`: fixed visual delays do not establish font/render readiness. The new screenshots wait for `document.fonts.ready`.
- `tests/ext-csp-scheme.spec.ts`: navigation checks have fixed waits and one expected-failure legacy model. Keep that negative control separate from release pass counts; it is not the production panel implementation.
- `tests/hero-creative.spec.ts`: Photos uses an engine double. This is UI wiring evidence, never codec/export evidence.
- Tab accessible names include their close button text. Exact `index.html` selectors can fail even when the tab is visible; the smoke matches the known complete name.

No test was suppressed, no assertion was weakened to hide a product failure, and no retries were added. If a repeat fails, retain its trace/screenshot and classify it as product failure, selector/fixture error, environment failure or unresolved flake. Quarantine requires a tracked reason, owner and expiry; never turn a red release gate green by retrying until it passes.

## Result discipline

`test-results/release-smoke.json` is the structured result. Failures retain a trace and screenshot; each studio attaches its shell screenshot. Inspect the actual screenshots before accepting a visual change. The gate uses one worker and zero retries. Run repeats on the same revision before calling it stable. Keep skipped tests and engine doubles separate from passed real-engine tests.

This checkout had no cargo and no generated slides WASM declaration. Rust tests therefore remained unexecuted; `tsc --noEmit` stopped at the existing missing `slides-engine/pkg/somnia_slides.js`. Do not label either as passed.
