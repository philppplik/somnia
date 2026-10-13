# Release notes section: Somnia CLI

Paste into the release notes of the version that ships the CLI.

## Command line (`somnia`)
- `somnia run "<task>"` runs an agent task on a local task branch. Exit codes: 0 done, 1 failed, 2 needs input or review.
- `--yes` commits the result locally as an unreviewed checkpoint. Without it, the work stays uncommitted for your review. The CLI never fetches, pulls or pushes.
- `--detach` starts a background run; `attach`, `status` and `cancel` follow it over a private same-user channel: a Unix socket (mode 0600 in a 0700 directory) or, on Windows, a named pipe that only your account can open. No network port is opened.
- `--json` prints one stable object (`somnia.run/1`); errors use `somnia.error/1` with fixed kinds.
- `--request-id` makes retries safe: a repeated id never starts a second run.
- Provider keys are read by the engine only and are never part of the protocol, records, logs or commits.
- Docs: usage, protocol, troubleshooting and the security review are in `docs/cli/`.

## Known issues
- The release archive needs `git` and `node` (20 or newer) on `PATH`; keep `sidecar/engine.mjs` next to the binary.
- The Windows named-pipe transport is covered by tests that run on a Windows CI host. It has not had a manual test on a real machine yet.
- Git runs your repository's own hooks and configured helpers on commit, status and diff, as it does for you. Open untrusted projects with the same care as untrusted code.
- `somnia run` drives the real agent engine (a Node 20+ sidecar): OpenRouter, Claude and OpenAI by API key, or Ollama. Cloud providers need `SOMNIA_ENGINE_CLOUD_CONSENT=1`. Tool calls, model, tokens and cost are logged live and shown in the TUI. See `docs/agent/TASK-ENGINE-CONTRACT.md`.
- Model-written text (progress, run summary) is stored as written and ends up in the session record and the commit message. Failure messages and tool summaries are redacted. Check the commit before you push it.
- The engine does not ask questions yet, and answering one from the TUI (`task.answers`) is not implemented. Unknown cost shows as 0 in the TUI; tokens are exact.
- A live run against a real cloud provider has not been tested; the tests use a scripted local Ollama.
- The CLI binary is unsigned on Windows and macOS, like the app installers.
