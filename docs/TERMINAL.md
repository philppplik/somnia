# Inline terminal (bottom panel)

The bottom strip above the status bar has two tabs: **Problems** and **Terminal**. The Terminal
tab watches install and build output and offers real interactive shells without leaving the
editor. Visibility is shared with the Problems toggle: `Mod+J` opens the strip on Problems,
`Mod+Shift+J` on Terminal; pressing the active tab's shortcut closes the strip. The selected tab
survives restarts (`somnia.bottomTab.v1`).

## What lives in the tab

- **Shell sessions**: interactive PTYs spawned by the Rust host (`src-tauri/src/terminal.rs`).
  The shell is the platform default: PowerShell on Windows (falls back to `COMSPEC`/cmd), `$SHELL`
  or `/bin/sh` elsewhere. The working directory is the open project root, then the process cwd.
  Sessions keep running when the panel closes; the view re-attaches to a bounded replay buffer
  (256 KB per session, older bytes dropped and counted). Up to 8 sessions run at once.
- **Run streams**: read-only mirrors of background processes (npm install, dev server, builds)
  from the framework runner. The output that used to sit inside Problems as a details block now
  renders as a scrollable read-only stream next to the shells. No console window ever opens:
  runners already spawn with `CREATE_NO_WINDOW` (`src-tauri/src/no_window.rs`), and PTYs use
  ConPTY on Windows, whose console host is invisible by design.

Copy works with Ctrl/Cmd+Shift+C (or Ctrl/Cmd+C with an active selection), paste with
Ctrl/Cmd+Shift+V (or Ctrl/Cmd+V off macOS). Resizing the panel resizes the PTY.

## Architecture

- `src-tauri/src/terminal.rs`: `TerminalManager` owns sessions (writer, reader thread, waiter
  thread, replay buffer). Events go through a sink; the desktop glue (`terminal::glue`) turns
  them into `somnia://terminal-output` / `somnia://terminal-exit` Tauri events with base64
  payloads. Commands: `terminal_spawn`, `terminal_list`, `terminal_attach`, `terminal_write`,
  `terminal_resize`, `terminal_kill`.
- `src/lib/terminal/`: `nativeTerminal.ts` is the IPC boundary (invoke + events, base64 decode),
  `terminalSessions.ts` is the session store (shells plus the mirrored run stream, unread
  markers, reconnect after reload).
- `src/components/`: `BottomPanel.tsx` (tab strip), `TerminalPanel.tsx` (session tabs, views),
  `XtermHost.tsx` (xterm.js instance, theming from CSS variables, copy/paste, fit).

## Security model

- Every command gates on the trusted `main` window, and the `editor` capability grants
  `allow-terminal-*` to that window only. Extension windows, previews, MCP servers and agent
  tools get no terminal capability.
- Shells are the user's own interactive shells (like the VS Code terminal): they inherit the app
  environment on purpose. Background *runners* stay on the scrubbed fixed-command path in
  `proc_runner.rs` (allowlisted env, redacted logs); the terminal is not a runner.
- All PTY children are killed when the main window closes or is destroyed, so no shell outlives
  the editor.

## Dependencies

- Rust: `portable-pty` 0.9 (MIT, wezterm project; ConPTY on Windows).
- Frontend: `@xterm/xterm` 6.0 and `@xterm/addon-fit` 0.11 (both MIT), pinned in
  `package-lock.json` and listed in the license inventory (`npm run licenses`).

## Known limits

- The Rust side is covered by `cargo test` (PTY roundtrip, buffer bounds, caps); the Tauri glue
  compiles in CI. Native behavior on Windows (ConPTY, PowerShell detection) needs Philipp's
  desktop test like all native chrome.
- The web build shows the tab and run streams but cannot spawn shells (no PTY without the
  desktop host); the empty state says so.
