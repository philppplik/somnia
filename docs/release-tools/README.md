# Release tools

`pub-beta.sh` publishes a GitHub pre-release from a green CI run. See the header of the script.

Process for each release:

1. Set `somniaRelease` in `phase1/package.json` to the new version. `scripts/sync-version.mjs` applies it to the Tauri config in CI.
2. Push, dispatch CI (`phase1-core-bootstrap.yml`) on the branch, wait for 4/4 jobs (native, macos, windows, frontend).
3. Write English notes: Highlights, Fixes, Known issues, Install, Checksums. State plainly what was only tested with mocked IPC and what was not tested on Windows or macOS.
4. Run `pub-beta.sh <version> <sha> <run-id> <notes.md> --dry-run`, check the file list, then run it without `--dry-run`.
5. Pre-release only, GitHub only. No Store changes, no signing decisions (those are the owner's).
6. Assets come only from CI artifacts built from repo source. Shared prebuilt WASM zips are never part of a release.

`windows-checklist.md` lists what to check on a real Windows machine.
