# CLI and runtime ownership (Wave A alpha)

Base: main 04bc442. CLI output is English-only for this alpha; application
locale keys are unchanged. No daemon, autostart or cloud credential flags.

## One owner, before recovery

`Runtime::open` delegates to `open_owned(data, enable_files, Gui, false)`.
Every runtime opening takes `data/owner.lock` before artifact vault or SQLite
AllActive recovery. The current root contains multiple Spaces in one SQLite;
this complete domain must be locked, not individual Space IDs.

The exclusive OS lock is authority. Metadata stores kind (gui/cli), PID,
heartbeat, lease deadline and clean-close marker. Heartbeats are every 10 seconds
with a 30-second diagnostic lease. An expired lease cannot steal a live owner's
lock. Unclean or malformed metadata requires explicit takeover after the OS lock
is released. A clean final Arc close releases the lock. Never unlink its inode.

Crash recovery route in this alpha:
`somnia-vibe --data SAME_GUI_DIRECTORY --takeover status`, then close the CLI
and reopen GUI. GUI reports the reason and never silently takes over. Its
OnceLock caches failed opens until app restart. No new Tauri commands added.

## Build and use

```
cargo build --manifest-path phase1/vibespace-cli/Cargo.toml
somnia-vibe --data /absolute/app-data/vibespace space create Website /absolute/project
somnia-vibe --data /absolute/app-data/vibespace studio create SPACE_ID "Edit page" qwen3.5:9b
somnia-vibe --data /absolute/app-data/vibespace start STUDIO_ID http://127.0.0.1:11434/v1/chat/completions
somnia-vibe --data /absolute/app-data/vibespace review RUN_ID
somnia-vibe --data /absolute/app-data/vibespace apply RUN_ID REVIEW_REVISION project/index.html
somnia-vibe --data /absolute/app-data/vibespace checkpoints RUN_ID
somnia-vibe --data /absolute/app-data/vibespace restore RUN_ID CHECKPOINT_ID
```

Use the SAME GUI data directory. Another root is a separate domain, not a
connection to the GUI. GUI and CLI cannot own that directory simultaneously.
CLI uses the shared Rust Runtime and Goose engine, not a second agent loop.
Folder grants are native host selections, validated/consumed by the same core.

Foreground start presents consent: allow-once/allow-run/deny. Empty input,
end-of-input and unknown replies deny. Ctrl-C revokes and stops. Original files
stay unchanged until explicit apply with the reviewed revision.
`status [RUN]`, `events RUN [AFTER_SEQUENCE]`, `stop RUN`, `steer RUN TEXT`,
`consent RUN REQUEST`, memory list/add/delete/search SPACE are also available.

For live stop/steer/consent without another owner, use `tui`: JSON command arrays
preserve paths/goals without unsafe shell parsing.

```
["start", "STUDIO_ID", "http://127.0.0.1:11434/v1/chat/completions"]
["status", "RUN_ID"]
["steer", "RUN_ID", "Use the shorter heading"]
["consent", "RUN_ID", "REQUEST_ID"]
["stop", "RUN_ID"]
```

Interactive start returns the run ID and stays attached to that terminal's
persistent owner. `quit` or end-of-input cancels active runs before close. This
is a line-oriented client, not a full-screen board. `daemon` returns Unsupported
without spawning (concept D1, confirmed for Wave A).

Windows file effects remain disabled until the existing native Windows gate
has evidence. Linux effects use the shared scoped broker/executor. An isolated
copy is not a strong OS sandbox. Explicit local-model HTTP requires numeric
loopback, no fallback or key environment variables. Cloud CLI is blocked until
a native vault/auth port exists. No live-model smoke is claimed.

## Verification

Core tests include double-open, clean-close, explicit stale recovery, lifecycle,
journal and security suites. Crash fixtures now abruptly exit actual child
processes, also while consent is pending. An old living owner is no longer a
valid restart simulation. Journal tests close their previous runtime first.

`phase1/vibespace-cli/scripts/smoke.sh` tests fixture create -> actual shared
Runtime/Goose/Broker -> visible consent -> review -> apply -> checkpoint; no
network. Original files stay unchanged until apply. Prompt denial defaults and
binary create/memory/restart/live-owner conflict are covered.

fs2 0.4.3: MIT OR Apache-2.0, both LICENSE files inspected; already in Desktop.
CLI uses the existing local crates. Windows/native desktop UI and live-model
smoke remain release/integration gates. New output is English-only intentionally.

The interactive smoke additionally verifies steer/stop under the same owner and
explicit deny leaves originals unchanged. The lock field is dropped last, after
native storage, policy and worker resources, to avoid a close/reopen race.
