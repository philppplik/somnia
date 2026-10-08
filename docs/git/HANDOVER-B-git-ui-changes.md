# Handover: package B (git-ui-changes)

Branch `agent/git-git-ui-changes`, base `somnia-agent` @ 77cd526. TS/React only; no Rust, no new dependency, no network, no auto-commit/push.

## What it adds (`phase1/src/components/versions/`)
- `controller.ts` ChangesController: view-model against `GitBackend`. Commit runs only from an explicit `commit()` call and sends exactly the ticked paths plus the reviewed `stateToken`. `state-changed` reloads, keeps ticks, shows "review again", saves nothing.
- `ChangesTab.tsx` (Changes tab + pure `ChangesView`), `VersionsPanel.tsx` (Changes tab, History slot `historySlot` for package C, Advanced switch), `VersionsHost.tsx` (store wiring: unsaved-buffer count via `getSavedFile`, save via `project.save`), `VersionsIcon.tsx`.
- `selection.ts` (default ticks: skip `suggestSkip`, conflicted not selectable, ignored hidden), `commitText.ts` (local deterministic name suggestion, 1-200 chars), `vocab.ts` (Advanced toggle, localStorage `somnia.versions.advanced.v1`; simple mode shows no Git words), `backend.ts` (`setGitBackend`, `createTauriGitBackend(invoke)` using the contract command names/arg shapes, `parseGitError`), `fakeBackend.ts` (test seam).
- Editor buffers are never committed: a banner shows the count of unsaved files with "Save files first".
- Errors: every `GitErrorCode` and `GitBlockReason` has a plain message; raw `detail` only in Advanced.
- A11y: checkbox per file with label, kind shown as text + glyph (not colour only), `role=alert/status`, `aria-live` count, keyboard-only controls, rail button has label/pressed state.

## Shared-file edits (all append-only)
`store/appStore.ts` LeftTab union + `'versions'`; `IconRail.tsx` one rail item; `LayersPanel.tsx` one TabsContent; `package.json` test glob appended; locale files: `versions.*` keys appended (en, de). **es/fr/pt-BR carry English text** for these keys (locale parity test requires the keys); translate later.

## Assumptions to check at integration
- Tauri arg wrapping: `git_commit`/`git_log`/`git_restore_as_new_version` are invoked as `{req}`; `git_diff_file` as `{path,base,target}`. Package A must match (contract table only says "GitCommitRequest"). Adjust `createTauriGitBackend` if A uses flat args.
- Nothing registers a backend in the browser build; the panel then shows "not available". Inside Tauri it uses the Tauri backend; until A lands the commands fail and the panel shows the "unknown" error.
- `untrusted-repo` is only displayed; the trust-confirm dialog is not in this package.
- Interactive behaviour in the real window (rail, layout, small window, dark theme) is unverified; tests are controller + server-render only (no DOM test lib in repo).

## Tests
`src/components/versions/versions.test.tsx` (17 tests, in `test:core` glob). Local: versions 17/17 pass; `npm run test:core` 1480 tests, 1436 pass, 0 fail (rest skipped by the runner); `tsc --noEmit` clean. `vite build` and Playwright e2e not run.
