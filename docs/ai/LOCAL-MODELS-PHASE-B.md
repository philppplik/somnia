# Local models: Phase B

Additive change on Phase A commit e1c7c965. No new crate or third-party dependency.

## Implemented

- Explicit Start Ollama action: Windows launches only the standard installed `ollama app.exe`; macOS uses `/usr/bin/open -a /Applications/Ollama.app`. No shell, arguments from a project, install script, elevation or silent configuration writes. Linux returns a command for the user to run, followed by manual Refresh. One status recheck follows Start; launch is not claimed to mean ready.
- App-global frontend manager survives Settings close/reopen. Only one owned pull runs; another request is refused, not silently queued. No automatic retries or restart downloads.
- Exact registry variant, source and unknown license/bytes/storage are reviewed before download. User acknowledgment is required. Custom registries and cloud aliases are refused. The daemon downloads directly; no document content is included.
- Native trusted-editor pull IPC streams bounded chunks. NDJSON is parsed across chunk boundaries. Layer digest/bytes are displayed without fake overall percentage or ETA. Phase changes distinguish verification, installation and reconciliation.
- Complete requires terminal success, a fresh installed inventory and the unchanged fail-closed `verifyLocalModel` semantics through fresh show metadata. EOF or 100% layer bytes cannot mean complete.
- Cancel stops the owned transport and reports daemon cancellation as Unknown. The contracts also permit Cancelled and Still active when a future transport can establish those states. No claim that shared daemon downloads stopped, no deletion of partial/shared blobs.
- Update re-pulls the confirmed exact variant. Remove requires explicit confirmation, saved Agent replacement first, idle AI, fresh digest match and refusal when `/api/ps` shows the model loaded. Fresh absence must confirm removal. Shared blob bytes are not promised reclaimed storage.
- Management remains loopback-only, proxy/redirect-free and gated to the trusted editor. Inference verification and cloud consent are unchanged.

## Verification and limits

Unit regressions and isolated rendered fixture tests cover split NDJSON, malformed progress, terminal success, local rejection, cancel uncertainty, one owned pull, error redaction/categories, review before mutation, removal reconciliation and activity guards. The manifest is regenerated and checked. Light desktop/dark narrow inventory, delete review and unknown-cancel pixels are inspected.

Rust tests and full application E2E are CI-only; no cargo/WASM run. Typecheck in this checkout is blocked by the unrelated generated `slides-engine/pkg/somnia_slides.js`. Native behavior needs Windows/macOS/Linux device checks. There is no live Ollama daemon in this verification. External clients can race a load after our check; Somnia cannot lock a shared daemon. Standard-path launch deliberately fails for nonstandard installs rather than guessing a command. Free disk/license metadata remains Not checked until catalog/hardware work lands. App restart interrupts the owned frontend job; it is not a persistent daemon job service.

Roadmap delta: A+B implemented, C hardware/advanced settings and D alternate runtime/CLI routing remain. Download catalog, durable restart recovery and host-level inference/management mutual exclusion are follow-ups.

Windows installed app executable verified against the vendor installer source: https://github.com/ollama/ollama/blob/main/app/ollama.iss
