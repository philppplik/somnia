# Coding command terminal

`Tools > Command terminal` opens a compact dialog. It runs the exact command only after an explicit effects checkbox and Run click. Opening the dialog does not run anything. There is no saved command history or automatic retry.

## Scope

- Desktop folder projects only. Browser and in-memory projects show an unavailable message.
- The backend resolves the open project ID, returns its canonical working folder for review, and checks the reviewed folder again at Run. The adapter binds the session to the editor's project generation.
- macOS/Linux: `/bin/sh -c`. Windows: `cmd.exe /D /S /C`, preserving shell quotes. Every command starts at the project root. `cd` and environment changes do not persist between commands.
- No PTY, stdin, interactive TUI, password prompts, persistent shell session, or terminal emulation. Output is line-buffered. stdout and stderr are merged; stderr is labeled, but ordering between streams is not guaranteed.
- Five-minute timeout, 4 KiB UTF-8 command, 1 MiB captured output, 16 KiB per output line. Exceeding an output bound requests Stop and marks output truncated. Up to two active commands, one per canonical project root, eight retained snapshots, four pipe readers. Detached processes holding pipes can exhaust reader capacity until they exit.
- Stop is a request until a terminal status arrives. Project close requests cancellation. Window close requests cancellation and waits up to two seconds for the monitor. Deliberately detached processes can escape the process group. No undo of command effects is possible.
- Closing the dialog does not stop the command. Reopening shows the same session. Changing projects clears old output and requests Stop. An unknown start keeps the request ID for status/Stop recovery and never retries the command.

## Security boundary

This is an OS command runner, **not a sandbox**. Commands can change or delete files, use the network, read home files and load credentials from disk. The UI says this before Run and asks users not to enter secrets. Save editor buffers separately first; external disk effects are not editor undo entries.

The child environment is allowlisted: PATH, HOME, USERPROFILE, OS paths, temp paths, locale and PATHEXT, plus NO_COLOR and TERM=dumb. Secret-like inherited environment values and common token/PEM patterns are redacted from captured output on a best-effort basis. This does not guarantee that output contains no secrets. Output is rendered as plain text, never HTML or terminal control sequences.

The framework runner still uses its fixed executable/argument path. Only its process-group kill and Windows Job helpers are reused. Shell commands have a separate run store and IPC surface, available only to the trusted editor window. The menu command opens UI only; it accepts no shell command parameter.

## Verification boundary

Session and native-adapter unit tests cover explicit execution, stable request IDs, duplicate-launch refusal, verified working folders, project replacement, unknown outcomes, Stop acknowledgment and final state. Browser tests exercise review, output, Stop, reopen, unavailable state and short-viewport layout in a mock IPC fixture, including Light/Dark screenshots. They are not native process execution tests.

Rust tests cover output, working folder, exit code, ownership, cancellation, timeout, project/window close, output bounds, redaction, retained requests and Windows quoting. Native compilation, these Rust tests, and packaged desktop end-to-end runs belong to CI. They were not run locally for this slice.
