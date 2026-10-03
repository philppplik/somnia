# Somnia backlog (as of 2026-10-03)

Branch: phase1-foundation. Source of truth for scope: STATUS.md and NEXT-BLOCK.md. This file only tracks open items.

## Open
- Markdown (.md) support: first as source view and export, a visual editor later. DOCX later through a converter (Philipp accepted "later").
- Canvas right-click context menu (web and native). Layer menu exists (PR #4).
- Web to local bridge and GitHub connection.
- Windows acceptance of Save/Recovery and GUI on alpha v3 (Philipp, running).

## Closed
- Settings and themes (#1), folder cancel fix (#2), layer context menu (#4), source diff viewer (#5), insert library (#6).
- #3 native GTK persistence smoke: closed as superseded by the Windows acceptance test. The GTK harness can be rebuilt later if CI needs a native smoke test.

## Rules
- Small feature branches, draft PRs into phase1-foundation, CI green before merge.
- No merge into main and no public deploy without Philipp's decision.
