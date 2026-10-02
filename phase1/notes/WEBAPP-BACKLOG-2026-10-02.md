# Webapp direction, October 2, 2026

Owner request: Philipp, WhatsApp 13:01:01, message wamid.HBgNNDkxNTkwNjg0OTMxMBUCABIYIEFDNURBRjIwM0Q1QTY1NUY5QzdDNjRBNEIxMzgwNzY1AA==. The original request covers theme contrast controls, a settings popup with side navigation, more insert components and saving user components, planning a web-to-local bridge and GitHub connection, and syntax color themes.

This is a backlog direction, not a claim these features exist. The current live Firefox fallback/theme patch and desktop foundation acceptance remain independent work.

## Phase 1 followup: settings and appearance

- Accessible settings modal with section navigation: Appearance, Code editor, Components, later Connections. Desktop/web presentation should share settings semantics without assuming identical storage.
- Theme contrast controls with explicit standard/high-contrast choices, clear focus indicators and readable tokens in both light and dark. Project canvas colors remain authored content, not app-theme overrides.
- Syntax color themes separate from app light/dark. Test HTML, CSS, JS and mixed code; persist the choice; preserve cursor/selection/readability and avoid resetting the document or undo history.
- Acceptance: keyboard navigation, focus return, Escape, narrow-screen layout, persistence/recovery failure visibility, pixel checks in Chromium and Firefox and native alpha.

## Phase 2: component library and reusable blocks

- Expand insert components with useful layout and content blocks, not framework runtime claims.
- Save a selected authored component to a named personal library, preview and reinsert it. Define dependencies, CSS scope, assets and source-preservation behavior before implementation.
- Default private/local storage. Export/import with explicit conflict handling. Scripts/events must remain disabled in the design sandbox.
- Acceptance: preview safety, roundtrip source integrity, undo insertion, rename/delete confirmation where needed and missing-dependency feedback.

## Later integration phase: web-local bridge and GitHub

Confirmed product direction, not yet connected or committed to a delivery date.

- Web-to-local bridge needs an authenticated local companion, scoped folder permission, explicit connection state and trustworthy save/conflict reporting. No unauthenticated localhost write service and no silent folder backwrite.
- GitHub web connection needs OAuth/account selection, repo and branch scope, local working state, explicit review of diff/conflicts and separation of commit/push from deployment. Default private scope; no implicit publication.
- Design the shared project/change model first so browser copies, native disk changes and remote commits do not become competing sources of truth.
- Recheck current API/security constraints and get owner approval for any account grant, publication, paid service or remote write outside the scoped workflow.
