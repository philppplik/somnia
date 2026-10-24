# Local models: Phase A

Read-only implementation based on `int/shell` at `22fe72d8`.

## Delivered

- Settings > AI > Local uses shared Tabs and a read-only installed-model list.
- Native detection checks executable locations and PATH without executing a binary. No daemon is started or installed. A failed probe stays unknown.
- Dedicated trusted-editor IPC reads only version/tags/show over HTTP loopback. Proxy use, redirects, URL credentials, paths, queries and fragments are refused. Responses are limited to 2 MB. Version has a 2-second timeout; metadata has a 5-second timeout.
- Inventory retains exact variants, digest, reported bytes, parameters and quantization. Empty inventory and failed inventory reads are separate states.
- Show capability metadata is read for the first 20 rows, with maximum two concurrent requests. Further pages expose explicit metadata reads. No model-name capability guessing.
- Local weights reported, remote-backed and unverified are separate labels. Metadata never replaces `verifyLocalModel` before inference. Text/tools/vision/embedding are advertised only, not tested adapter support. No audio or image input is enabled.
- Entry and explicit Refresh trigger reads. Hidden-tab results cannot overwrite a newer generation. There is no polling or inference.
- Browser previews clearly report native inspection unavailable. Strings cover en/de/es/fr/pt-BR.

## Roadmap delta

Phase A read-only runtime and Settings surface are implemented. Phase B process start/pull/cancel/update/delete, Phase C hardware advice, and Phase D alternate runtimes/CLI models remain separate work. No new dependency or crate was added; existing reqwest and url are reused. Provider routing, credentials, consent and inference verification are unchanged.

## Verification

Unit tests cover endpoint rejection, inventory errors, capability evidence, cloud aliases, runtime states, browser no-op, bounded show concurrency, locale coverage, five-tab rendering/navigation fallback and existing Ollama verification tests.

Rendered fixture tests: `npx playwright test --config local-models.playwright.config.ts`. They check keyboard activation/wrapping across all five shared tabs, empty vs malformed inventory, remote provenance, advertised capability labels and narrow layout. The fixture never imports a native/WASM runtime.

Full application E2E and Rust tests are CI-only for this change. Typecheck in this checkout is blocked solely by the missing generated `slides-engine/pkg/somnia_slides.js` module. No cargo/WASM build was run. Native daemon access and executable probes still need Windows/macOS/Linux owner-device validation before leaving beta. Fixture screenshots are not proof of live Ollama behavior.

The generated native-command manifest is updated with both new read-only IPC commands; `npm run check:commands` passes.
