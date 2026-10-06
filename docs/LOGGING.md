# Logging and error handling

One path for the whole app, desktop and web.

- **Log file (desktop):** `<app data dir>/logs/somnia.log`, JSON lines `{ts, level, source, message, context}`. Rotates at 1 MB, keeps `somnia.1.log` to `somnia.3.log`. Written by `src-tauri/src/applog.rs`.
- **Frontend:** `src/lib/log.ts`. `log`, `logWarn`, `reportError(source, error, {notify})`. Entries go to a 300-entry ring buffer and, in the desktop app, to the log file via the `log_write` command.
- **Captured automatically:** unhandled errors and promise rejections (`installGlobalErrorHandlers`), React render failures (`ErrorBoundary` around the app and the lazily loaded source editor), Rust panics (panic hook) and service errors returned from file commands.
- **Load failures:** startup modules (LAN host, desktop/browser file adapter, store check), extension construction/activation/timeouts, and the lazy source editor are logged and show a short non-blocking hint in the status notice instead of failing silently.
- **Agent:** `runWithProviderConsent` logs provider failures (`ProviderError` code, consent denial; user aborts are not logged), the session logs failed turns and tools, and the apply path logs blockers (reason and path only). Logged messages are clipped to 200 characters.
- **Secrets:** text and object keys are redacted before anything is stored (API keys, `sk-`/`ghp_`/`github_pat_` style tokens, `Bearer ...`, `key=`/`token=`/`password=` values, sensitive object keys). The same rules run in Rust and again when an error report is built. Prompts, file contents and tool arguments are never logged.
- **Error report:** Help > Copy error report (command palette) or Settings > About. Copies version info plus the last 150 log lines.
- **Dev console:** in dev builds `window.__somnia.recentLog()` and `copyErrorReport()`.

New code: call `reportError('area.name', error, {notify: 'Short hint.'})` in a `catch` instead of `console.error` or an empty catch.
