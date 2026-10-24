# Publish in the studio shell

The Publish dialog stays. This adds the same flow to the Code studio shell, so a site can be published and checked
without leaving the work area. Concept: `docs/concepts/live-deployment.md` section 9.

## Panels and sections

| Where | Id | Shows |
| --- | --- | --- |
| Left rail, order 90 | `publish` | Saved servers with a state chip (Ready, Needs trust, Needs a key), Add a server, Manage servers, the selected server (address, pinned fingerprint), Publish, Preview changes, the counts of the last preview |
| Left rail, order 100 | `publish-log` | Live log of the running publish or rollback, last result with Open, earlier versions with Go back |
| Inspector, order 40 | `publish-target` | Server and address, domain field with validation |
| Inspector, order 50 | `publish-framework` | The detected framework, what it builds (static or Node server) and whether the selected target kind fits |
| Inspector, order 60 | `publish-dryrun` | File diff of the last preview: new, changed, removed, bytes to upload, first 40 files |

All of it is manifest data in `lib/deployPanels/shell.ts`, spread into the Code manifest. Hosts live in
`components/deploy/DeployPanels.tsx` and register through `registerStudioPanels` in `studios/code/registerShell.ts`.
The panels read the one Publish store (`lib/deploy/publishStore.ts`), so dialog and panels never disagree.
Desktop only: the web build shows a one-line note instead.

## Commands

All four are `ui` level. The dispatcher refuses agent and MCP origins, and each handler checks the origin again.

| Id | Does |
| --- | --- |
| `deploy.panel.show` `{panel}` | Opens `publish` or `publish-log` in the left stack |
| `deploy.target.select` `{targetId}` | Selects a saved server (ignored while something runs) |
| `deploy.dryrun` `{targetId?}` | Build if needed, then `deploy.plan`. Uploads nothing, no confirmation |
| `deploy.target.setDomain` `{targetId, domain}` | Saves a changed copy of the target through `deploy.target.save`. Empty removes the domain. Scheme, path or port is refused |

Publishing and rolling back stay `deploy.publish` and `deploy.rollback`: every call opens the confirmation dialog with
server, pinned fingerprint and file list. The panel buttons call the same commands. Nothing in the panels can skip that dialog.

## Store additions

- `dryRun(id)`: runs the shared build step (now `buildFirst`, also used by `publish`), then `deploy.plan`, and keeps the plan in `staged`. New busy state `plan`.
- `updateTarget(id, patch)`: domain, SPA flag, app port or name. Id, host, user and key slot cannot change here.
- `__setPublishBackendForTests(backend)`: swaps the Tauri backend for a fake before the store exists.

## Verification

- Unit suites in `src/lib/deployPanels/`: view models, command origins and params, five-language parity, store behavior against a fake engine (`fakeBackend.ts`).
- `node scripts/verify-deploy-panels.mjs` drives the real shell in a browser against the fake engine (fixture `test/deploy-panels.html`) and writes light and dark screenshots to `tests/artifacts/deploy-panels/`. It checks that a dry run only plans, that Publish stops at the confirmation dialog with nothing published, the empty state and the Node-needed advice.
- Not verified: the real Rust engine, a real server, the desktop window. The fake engine never opens a socket.
