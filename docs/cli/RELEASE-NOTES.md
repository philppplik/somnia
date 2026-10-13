# Release notes section: Somnia CLI

Paste into the release notes of the version that ships the CLI.

## Command line (`somnia`)
- `somnia run "<task>"` runs an agent task on a local task branch. Exit codes: 0 done, 1 failed, 2 needs input or review.
- `--yes` commits the result locally as an unreviewed checkpoint. Without it, the work stays uncommitted for your review. The CLI never fetches, pulls or pushes.
- `--detach` starts a background run; `attach`, `status` and `cancel` follow it over a private same-user socket (mode 0600 in a 0700 directory). No network port is opened.
- `--json` prints one stable object (`somnia.run/1`); errors use `somnia.error/1` with fixed kinds.
- `--request-id` makes retries safe: a repeated id never starts a second run.
- Credentials are never part of the protocol, records, logs or commits.
- Docs: usage, protocol, troubleshooting and the security review are in `docs/cli/`.

## Known issues
- Windows named-pipe transport is not implemented: on Windows, only foreground runs work; `--detach`, `attach` and `cancel` are unavailable.
- Git runs your repository's own hooks and configured helpers on commit, status and diff, as it does for you. Open untrusted projects with the same care as untrusted code.
- Engine text (summary, failure message) is stored as written; the CLI does not scrub it.
- The terminal UI frames for tool calls, model and cost are not mapped yet.
- The CLI binary is unsigned on Windows and macOS, like the app installers.
