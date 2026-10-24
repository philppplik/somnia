# Publish panel (D4)

The renderer side of live deployment (`docs/concepts/live-deployment.md`, milestone 4). Desktop only: the header **Publish** button, the command `deploy.open` (palette, Project menu, Ctrl+Shift+U) and `PublishDialog` are not offered in the web build.

| Piece | File |
| --- | --- |
| Dialog: servers, key and trust steps, progress, result, rollback list | `phase1/src/components/PublishDialog.tsx`, styles in `styles/publish.css` |
| State and actions (React-free) | `phase1/src/lib/deploy/publishStore.ts`, wired in `publishController.ts` |
| Error codes to plain language, progress words, release labels, server form rules | `phase1/src/lib/deploy/publishModel.ts` |
| Confirmation and host-key dialogs (D3, unchanged) | `components/DeployConfirmHost.tsx` |

Rules the panel keeps:

- Everything that changes the server or saved targets runs through the `deploy.*` CommandSpecs with origin `ui`. The panel never mints a token or a gesture; the confirmation dialog still appears on every publish and rollback.
- The renderer holds only the public key line returned by `deploy.key.create`, and only for the session. It is shown after a character check.
- Errors are shown as one sentence from `deploy.err.<code>` plus the actions in `publishModel.ts`. Raw messages never reach the screen.
- Progress comes from the `deploy-progress` event. Words the panel understands: `connect`, `check`, `upload` (optionally `upload:7/12`), `switch`, `health`. Other words are ignored.

New Tauri commands (full checklist done): `deploy_releases(targetId)` returns release ids for the rollback list; `deploy_open_site(targetId)` opens `https://<domain>` of a saved target in the system browser (the URL is built in Rust from the validated domain).

Tests: `src/lib/deployPublishModel.test.ts`, `src/lib/deployPublishStore.test.ts` (real command specs, fake service), `src/components/PublishDialog.test.tsx`, and `tests/publish-panel.spec.ts` (Playwright, mocked IPC: `npx playwright test --config playwright.publish.config.ts`; set `PUBLISH_SHOTS=/some/dir` to save screenshots).
