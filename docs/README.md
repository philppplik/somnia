# Somnia documentation

New to Somnia? Start with the [user guide](guide/README.md). It has the quickstart, one page per area, and honest status labels (Stable, Pre-release, In development).

## Map

| You are | Go to |
| --- | --- |
| A user | [User guide](guide/README.md): [Quickstart](guide/quickstart.md), [Studios](guide/studios.md), [Hero actions](guide/hero-actions.md), [Deploy](guide/deploy.md), [Frameworks](guide/frameworks.md), [Command line](guide/cli.md), [Extensions](guide/extensions.md), [Settings](guide/settings.md), [Troubleshooting](guide/troubleshooting.md) |
| An extension author | [Extensions](extensions/README.md), [v2 index](extensions/v2/index.md) |
| A contributor | [Architecture](ARCHITECTURE.md), [Build, CI and release](BUILD-AND-RELEASE.md), [Docs style](DOCS-STYLE.md), [Roadmap](ROADMAP.md) |
| Looking for a design decision | [`concepts/`](concepts/), [`decisions/`](decisions/), [`phase1/notes/`](../phase1/notes/) |

Change history: [Changelog](../CHANGELOG.md). Releases: <https://github.com/philppplik/somnia/releases>.

## Technical reference

- [Transcript Hub](features/transcript-hub.md): optional local file transcription, limits, privacy and validation.


- [AGENTS.md](../AGENTS.md): map for AI contributors: layout, commands, rules, release caveats. UI command layer reference: `phase1/src/lib/commandSpec.ts` (spec type) and `phase1/src/lib/commandDispatcher.ts` (dispatch), see the section "Two kinds of command" there.

- [Dreamweaver parity checklist](dreamweaver-parity.md): generated list of which Dreamweaver capabilities Somnia has, partly has or lacks. Source: `phase1/scripts/dreamweaver-parity/catalog.ts`; regenerate with `npm run inventory:dreamweaver-parity` from `phase1/`.

- [Native UI design system](design/native-ui/README.md): exact tokens, theme/appearance cascade, components, UX, context and awareness, Studio direction, and verification.

- [Architecture](ARCHITECTURE.md): Rust backend, command ACL, project service, frontend, storage port, security boundaries, testing.
- [Build, CI and release](BUILD-AND-RELEASE.md): local builds, versioning, CI jobs, release assembly.
- [Changelog](../CHANGELOG.md) and [v11.1.0 release-notes draft](releases/v11.1.0.md): implemented release changes and publication checks.
- [Agent](agent/README.md): the AI panel (architecture, providers, privacy, MCP plan).
- [Provider account authentication](auth/README.md): current API-key user/developer guides, account-OAuth integration status and security/policy checks.
- [Extensions](extensions/README.md): build, install and secure Somnia extensions.
- [Live collaboration](collaboration.md): share a project, join by link, your name and picture, session chat, encryption and its limits.
- [Code studio rail](studios/code-rail.md): shell v2 rails, icons, inspector sections and rail customization for the Code studio.
- [Header hero action](studios/header-hero-action.md): the per-studio primary action slot in the header, its manifest field and the Publish fallback.
- [Per-studio hero actions](studios/hero-actions.md): Code Preview, Documents Export (real DOCX copy) and Sheets Smart Formula with target safety.
- [Video Studio](studios/video.md) ([plan](studios/VIDEO-PLAN.md)): open, trim, multi-clip edit, filmstrip, titles, crossfades and export, with the honest platform limits.
- [Command line (`somnia`)](cli/usage.md): [protocols](cli/protocol.md), [troubleshooting](cli/troubleshooting.md), [security review](cli/security.md).
- [CLI and TUI protocol](cli/TUI-PROTOCOL.md): NDJSON v1 between `somnia run --tui-stdio` and `somnia-tui`, including answering questions.
- [Logging and error handling](LOGGING.md), [Window background](WINDOW-BACKGROUND.md), [Folder drop](FOLDER-DROP.md).
- [Roadmap](ROADMAP.md), [Performance budgets](PERFORMANCE-BUDGETS.md), [Large projects](PERF-LARGE-PROJECTS.md).
- [LaTeX math (Stage 1)](features/latex-math.md): Markdown formulas, .tex math preview, errors, safety and settings.
- Feature notes: [Markdown live preview](features/markdown-live-preview.md), [`features/`](features/), [`i18n/`](i18n/), [Collaboration share UI](collab-share-ui.md), [`fixes/`](fixes/).
- Deploy: [SSH transport and server bootstrap](DEPLOY-SSH.md).

The app source lives in [`phase1/`](../phase1/). Architecture decisions (ADR-001 to ADR-005) and per-feature design notes are in [`phase1/notes/`](../phase1/notes/). The collaboration relay is documented in [`relay/`](../relay/README.md). Somnia is MIT licensed, see [LICENSE](../LICENSE).
- [Studio lifecycle](studio-lifecycle.md): active/warm/suspended/evicted states, checkpoint suspension, resource budgets, pressure handling and local telemetry.

Conventions: documentation is English. One topic has one home: put new technical detail into the matching document above and link to it instead of copying it. `phase1/notes/` holds decisions and feature notes that explain why something was built; `docs/` holds how the system works now.
