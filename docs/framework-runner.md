# Local framework runner

The desktop app downloads Node 24.21.0 explicitly, once, into its private app data folder. SHA-256 hashes are pinned for Windows x64/arm64, Linux x64/arm64 and macOS x64/arm64. Hash source: https://nodejs.org/dist/v24.21.0/SHASUMS256.txt. Runtime selection source: https://nodejs.org/dist/index.json. The version is current LTS as checked on 2026-10-13. Updating the helper requires a new pin and verified hashes, not a mutable download URL.

## Frontend API

`src/lib/frameworks/runner.ts` exports:

- `projectRunner.start(projectId, kind)`, `stop(runId)`, `status(runId)`, `onLog(runId, listener)`.
- Kinds: `install`, `dev`, `build`.
- States: `starting`, `running`, `exited`, `stopped`, `timedOut`.
- `RunnerHandle`: id, projectId, kind, state, optional port, previewToken, url and exitCode. The preview token is ephemeral. Do not persist, export or log it.
- `runtimeStatus()`, `installRuntime()`, `removeRuntime()`.
- `openFrameworkPreview(runId)`, `closeFrameworkPreview(runId)`.

Native execution accepts only an opaque opened-project ID. Rust resolves the directory from the existing project service while holding its lock. The renderer cannot choose an executable, environment, shell command, runtime path or execution directory. UI command specs reject agent and MCP origins.

`install` requires the Somnia manifest and package-lock.json and runs bundled npm `ci --ignore-scripts --no-audit --no-fund`. `dev` and `build` select fixed package CLI entry points from a framework allowlist. Project package.json scripts never choose the command. Third-party config and plugins still execute as the user: this is not an OS security sandbox. Dev additionally requires somnia-preview.mjs. No credentials are retrieved from the keychain or passed to children.

## Limits and cleanup

At most two project processes and one process per project. Installation times out after 10 minutes, build after 5 minutes. Preview readiness times out after one minute; only a successful protected plugin endpoint response changes `starting` to `running`. Logs cap at 5 MB and 16 KB per line, after which the process is stopped. Retain at most 32 handles. Log reads return up to 256 lines and a cursor. PEM blocks, credential-like fields, bearer tokens and inherited secret canaries are redacted before storage. All IPC errors use fixed translation keys.

Children receive an allowlisted environment, a private HOME and npm config/cache. Only generated SOMNIA_PREVIEW_TOKEN, SOMNIA_PREVIEW_PORT and SOMNIA_PARENT_ORIGIN are added for dev. No shell is used, including on Windows. Unix uses a process group; Windows uses a kill-on-close job object. Successful project close stops its process; main-window exit stops all. A canceled unsaved-close dialog leaves runs alive.

The helper cannot be removed while a project runs. Removing it leaves projects intact. Code editing works without the helper.

## Native preview and source inspection

Tauri's existing main-window CSP cannot be relaxed dynamically. Instead, preview_open creates a separate external webview with no editor capability, bound to the exact loopback origin. New windows and downloads are denied. Project code receives no Tauri IPC. Closing the preview stops its run. Stop or exit destroys the preview.

The protected Vite plugin exposes GET /__somnia/source-events, authenticated with `Authorization: Bearer <previewToken>`, returning `{events:[{file,line,col}]}`. POST to the same route queues source-click events and must authenticate too. Rust polls only while the preview is open, caps responses at 64 KB and 64 events, validates relative paths and canonical root containment, rejects node_modules, .git and .env paths, and emits `somnia://framework-source` only to main: `{projectId,file,line,col}`. Lines and columns are one-based. These events select source; they never execute commands or mutate files.

## Command checklist

All ten commands are present in desktop.rs, build.rs, capabilities/editor.json, generated commandNames.ts and docs/errors/commands.json. scripts/errors/gen-commands.mjs classifies them as frameworks. tauriPermissions.test.ts checks manifest and close hooks. Run `npm run check:commands` after changes.

## Verification

Local tests cover checksum mismatch/truncation, archive confinement, absent helper, command-origin gates, incremental logs and unsubscribe, locale parity, redaction, caps, timeout and cancel kills, and stop-all waiting. A Linux smoke test downloads and verifies the pinned helper and executes its npm CLI. The native preview and Windows job behavior require a desktop run. No Actions or live deployment server is used.
