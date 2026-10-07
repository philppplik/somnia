# Somnia documentation

Start here:

- [Architecture](ARCHITECTURE.md): Rust backend, command ACL, project service, frontend, storage port, security boundaries, testing.
- [Build, CI and release](BUILD-AND-RELEASE.md): local builds, versioning, CI jobs, release assembly.
- [Changelog](../CHANGELOG.md) and [v11.1.0 release-notes draft](releases/v11.1.0.md): implemented release changes and publication checks.
- [Agent](agent/README.md): the AI panel (architecture, providers, privacy, MCP plan).
- [Extensions](extensions/README.md): build, install and secure Somnia extensions.
- [Live collaboration](collaboration.md): share a project, join by link, your name and picture, session chat, encryption and its limits.
- [Logging and error handling](LOGGING.md), [Window background](WINDOW-BACKGROUND.md), [Folder drop](FOLDER-DROP.md).
- [Roadmap](ROADMAP.md), [Performance budgets](PERFORMANCE-BUDGETS.md), [Large projects](PERF-LARGE-PROJECTS.md).
- [LaTeX math (Stage 1)](features/latex-math.md): Markdown formulas, .tex math preview, errors, safety and settings.
- Feature notes: [Markdown live preview](features/markdown-live-preview.md), [`features/`](features/), [`i18n/`](i18n/), [Collaboration share UI](collab-share-ui.md), [`fixes/`](fixes/).

The app source lives in [`phase1/`](../phase1/). Architecture decisions (ADR-001 to ADR-005) and per-feature design notes are in [`phase1/notes/`](../phase1/notes/). The collaboration relay is documented in [`relay/`](../relay/README.md). Somnia is MIT licensed, see [LICENSE](../LICENSE).

Conventions: documentation is English. One topic has one home: put new technical detail into the matching document above and link to it instead of copying it. `phase1/notes/` holds decisions and feature notes that explain why something was built; `docs/` holds how the system works now.
