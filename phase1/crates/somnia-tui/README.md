# somnia-tui

Terminal UI for the Somnia CLI (v1: run + watch + approve). Rust, ratatui + crossterm.
Standalone crate (own `[workspace]`), so it does not touch the Tauri build.

    somnia-tui [--light] [--no-color] -- <headless core command...>
    somnia-tui --demo | --replay FILE.ndjson | --capture DIR | --version

Exit codes: 0 done, 1 failed, 2 needs input.

## Contract with the headless core (protocol v1, NDJSON on stdio)

The TUI depends only on this, not on core code. Core writes events to stdout, reads commands from stdin.
Every line carries `"v":1`. Unknown event types are ignored; other versions are rejected.

Events: `session_started{task_id,prompt,branch,base_sha,model}`, `text_delta{text}`,
`tool_call{id,name,summary}`, `tool_result{id,status:ok|error,summary}`,
`diff_proposed{review_id,file,content_hash,hunks[{id,header,lines[]}]}`, `guard_blocked{reason}`,
`status{cost_usd,tokens,branch,state}`, `needs_input{question}`, `done{status:done|failed|needs_input,result_sha,summary}`.

Commands: `review_decision{review_id,content_hash,accepted_hunks[],rejected_hunks[]}`, `cancel`.

`content_hash` = hex sha256 of `file \0 (hunk.id \0 lines.join("\n") \0)*`. The TUI recomputes it on the raw
event; a mismatch makes the review unapprovable. The decision echoes the hash so the core can bind it to the
exact content the user saw. An active `guard_blocked` (unsaved desktop buffer, C2) also makes Enter a no-op.
No field carries tokens. Text from the core is stripped of control characters before display.

## Look

Full gradient splash (`--version` on a tty), compact 3-row header, exit snapshot with
`Resume: somnia resume <task_id>`. Truecolor gradient #002AFF -> #EE00FF -> #FF001E, 256-color
approximation, monochrome when NO_COLOR, `--no-color`, TERM=dumb or not a tty. Machine mode emits no banner.

## Tests

    cargo test          # 14 tests: contract, guard, hash binding, rendering, spawned-core roundtrip
    scripts/pty_drive.py target/release/somnia-tui out.raw    # real pty end-to-end (demo)
    somnia-tui --capture DIR [--light]; scripts/ansi2png.py DIR/x.ansi x.png [dark|light]
