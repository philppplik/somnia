# AGENTS.md

Map for AI contributors. Humans can use it too. Keep it short and correct; if something here is stale, fix it in the same PR.

## What this is

Somnia is a desktop and web creative suite (code, design, vector, photos, PDF, sheets, slides, sound, video studios). Frontend: TypeScript, React, Vite. Desktop shell: Tauri 2 (Rust). Pixel and file-format work: Rust compiled to WASM. License: MIT.

## Layout

| Path | What lives there |
| --- | --- |
| `phase1/` | The app. Run all npm commands from here. |
| `phase1/src/` | Frontend: `components/`, `lib/` (logic, no UI), `store/`, `themes/`, `locales/`, `generated/` (do not edit by hand). |
| `phase1/src-tauri/` | Rust host, Tauri IPC commands, ACL in `capabilities/`. |
| `phase1/packages/editor-core/` | HTML editing core: transactions, undo, parse5 model. |
| `phase1/craft`, `photos-engine`, `sheets-craft`, `pdf-craft`, `sound`, `slides-engine`, `vibespace-*` | Studio engines and WASM crates. |
| `phase1/tests/` | Playwright E2E specs. `phase1/test/` holds fixtures and `tsx --test` suites. |
| `phase1/notes/` | Decisions (ADRs) and feature notes: why something was built. |
| `docs/` | How the system works now. Index: [docs/README.md](docs/README.md). |
| `relay/` | Collaboration relay server. |
| `scripts/`, `phase1/scripts/` | Repo and build scripts. |

## Commands (from `phase1/`)

| Task | Command |
| --- | --- |
| Unit and core tests | `npm run test:core` (tsx `--test`; one file: `npx tsx --test path/to/x.test.ts`) |
| Typecheck | `npx tsc --noEmit` or `npm run typecheck` |
| Build | `npm run build` |
| E2E | `npm run test:e2e` (Playwright; many specs have their own `playwright.*.config.ts`) |
| Tauri IPC manifest check | `npm run check:commands` |
| Benchmarks | `npm run bench` |
| Rust | `cargo test` in `phase1/src-tauri` (toolchain pinned in `rust-toolchain.toml`) |

Known issue: `tsc` reports an existing error in `slides-engine`. Do not "fix" it as a side effect of unrelated work, and do not add new errors.

## Two kinds of "command"

1. **Tauri IPC commands** (Rust functions the frontend calls). Manifest and ACL are checked by `npm run check:commands`. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
2. **UI commands** (menu, shortcut, palette, macros, agents). Today they live in `phase1/src/lib/commands.ts` plus scoped registrations. The engine-hardening work adds a typed command layer: `src/lib/commandSpec.ts` (spec type), `src/lib/commandDispatcher.ts` (single dispatch), `src/lib/commandBridge.ts`, with `check:ui-commands` and `check:layers` checks. These modules arrive with the P0 foundation package; until they are on your branch, read `commands.ts` and `commandContracts.ts`.

Do not mix the two. New user-facing actions should become a UI command with a stable id, not a one-off handler.

## Rules

- **Layers.** UI is a client of the engine. `src/lib/**` must not import from `src/components/**`. Studio engines do not import UI. Once `check:layers` exists, do not grow its allow-list.
- **i18n.** Five locales: `en`, `de`, `es`, `fr`, `pt-BR` (`phase1/src/locales/`). Every new user-visible string needs all five. Locale tests must stay green.
- **Docs are English.** One topic, one home: link instead of copying. Plain style, no emdashes.
- **Agent safety model.** Outside clients (MCP, agent tools) are read and propose only. The user reviews every change. `execute` level never leaves the app. Do not weaken this. See [docs/MCP-SERVER.md](docs/MCP-SERVER.md) and [docs/agent/TOOL-REGISTRY.md](docs/agent/TOOL-REGISTRY.md).
- **Tauri ACL.** Do not edit `capabilities/` or permission lists unless the task says so.
- **Third-party code.** Pinned revisions only, listed in the NOTICE files of the engine directories and the license inventory (`npm run licenses`). Copy ideas, not code, from other projects, and keep brand assets out.
- **Scope.** Touch only the paths your task lists. Shared files (`package.json` scripts, `commands.ts`, CI workflows) have one owner at a time; rebase after it merges.
- **Tests.** Add tests with every change. Prefer `tsx --test` for logic, Playwright for UI.
- **Generated files.** `src/generated/*` and `docs/errors/commands.json` come from scripts. Regenerate, do not hand-edit.

## Releases

- Version channels and CI jobs: [docs/BUILD-AND-RELEASE.md](docs/BUILD-AND-RELEASE.md).
- Installers are unsigned (SmartScreen and Gatekeeper warn). Do not describe them as signed.
- A version counts as stable only after Philipp has tested it on Windows and given his go. Alphas and betas ship from green CI; stable and store submissions wait for his go.
- Native window behavior (frameless chrome, rounded corners, folder access) cannot be verified in the web build. Say so in your PR instead of claiming it works.

## Git

- Feature branch per task, small PRs, conventional commit messages (`feat(scope): ...`, `fix(scope): ...`, `docs: ...`).
- Never commit secrets or tokens. Never force-push shared branches.
- Update `CHANGELOG.md` for user-visible changes.

## Where to read next

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/agent/README.md](docs/agent/README.md), [docs/design/native-ui/README.md](docs/design/native-ui/README.md), [docs/extensions/README.md](docs/extensions/README.md), [docs/ROADMAP.md](docs/ROADMAP.md).
