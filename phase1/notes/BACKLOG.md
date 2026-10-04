# Somnia backlog (as of 2026-10-03)

Branch: phase1-foundation. Source of truth for scope: STATUS.md and NEXT-BLOCK.md. This file only tracks open items.

## Open
- Markdown (.md) support: first as source view and export, a visual editor later. DOCX later through a converter (Philipp accepted "later").
- Canvas right-click context menu: done (see CANVAS-CONTEXT-MENU.md). Duplicate and delete done in canvas and layer menus; Insert and canvas keyboard open still open.
- Web to local bridge and GitHub connection: Philipp chose option B (browser File System Access API). Plan in ADR-002-web-local-bridge.md; GitHub connection later.
- Windows acceptance of Save/Recovery and GUI on alpha v3 (Philipp, running).

## Closed
- Settings and themes (#1), folder cancel fix (#2), layer context menu (#4), source diff viewer (#5), insert library (#6).
- #3 native GTK persistence smoke: closed as superseded by the Windows acceptance test. The GTK harness can be rebuilt later if CI needs a native smoke test.

## Rules
- Small feature branches, draft PRs into phase1-foundation, CI green before merge.
- No merge into main and no public deploy without Philipp's decision.

## v10 progress
- Draft restore (memory-only project): done. Disk projects rely on the existing recovery files.
- Project search/replace (Ctrl+Shift+F): done; click opens the file, no jump to the line yet.
