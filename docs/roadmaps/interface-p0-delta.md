# Interface editor foundation: P0 delta

Base: `int/shell` at `ac4bacc7` (2026-10-14). This is the explicitly assigned editor-foundation P0, not completion of the concept's numbered Phase 0 extraction spike.

## Implemented

- Native `interface` StudioDef, blank start and allowlisted canvas/panel hosts. Separate from Design and Vector; no extension/file format claim. Existing numeric studio shortcuts remain unchanged.
- Version-1 Somnia-owned scene: named pages and ordered trees of frames, groups, rectangles and text; stable IDs, explicit parent links and revisions. Nested frame clipping and absolute positioning only.
- Validated immutable snapshots, bounded tree/count/geometry/payload checks, optional JSON-field preservation and same-version reopen. Corrupt imports do not replace working content.
- Atomic transactions with rollback and one-step undo/redo. Reparent preserves absolute coordinates; reorder and subtree deletion are transactions. Session/revision checks reject stale gesture commits.
- Basic scrollable/zoomable canvas with selection, move/resize preview, pointer cancellation/Escape, keyboard nudge and numeric edit alternatives. Preview changes never enter recovery or undo history.
- Ordinary shell panels: Pages/Layers left (268px) and Properties right (320px). No duplicated generic inspector. Selection does not reopen closed panels.
- Local recovery with dirty/page restoration; storage failure is visible. Selection/history stay transient. Cross-studio Save All/Close All tracks Interface work and clears recovery on explicit close.
- JSON snapshot picker validates before replacing. Confirmed File System Access writes clear dirty only for the exact saved revision. Download fallback explains that a copy was downloaded and keeps dirty. No `.somui`/`.fig`/`.somnia` ownership claim.
- UI-only typed commands, menus, shared Save/Undo/Redo/Delete scopes and five-locale copy. No new AI tools, remote access or SDK surface.

## Evidence

- 195 focused unit/render/registry/routing/shell tests passed, including model, undo, failed batch rollback, recovery failure/corruption, gestures, save cancellation/error/stale write, manifest boundaries and locale coverage.
- `check:ui-commands` passes with 299 commands and five locales. `check:commands` passes. No tests removed or weakened; registered-studio enumeration now asserts Interface too.
- Whole-app typecheck stops on the existing absent generated `slides-engine/pkg/somnia_slides.js`; no Interface errors reported. No engine stub added.
- Whole `test:core` exceeded the local command time limit after 1049 passing subtests. It did not finish and is not claimed as passing.
- Isolated component pixels inspected at 960x600 dark/German, 1280x720 light/English, 1440x900 dark/English and 1920x1080 light/German. Checkbox width fixed and re-inspected. These previews use shared controls/tokens but are not application-shell screenshots.
- Application acceptance test added at `phase1/tests/interface-studio.spec.ts`; not run locally (CI-only). No Cargo/WASM build, engine import or new third-party dependency. `check:no-control` cannot inspect absent production `dist` and is not claimed as passing.

## Remaining gates and scope

Run application E2E and inspect full shell screenshots in CI, including studio-pill baseline changes, saved panel choices, UI scaling, long labels and Agent-open width budgets. At 960px the isolated two-side layout has a narrow scrollable canvas; shared overlay policy is outside this patch.

The concept's extraction/license/layout-engine spike remains unimplemented. No FigCraft code or dependency adopted. Auto layout/Hug/Fill, assets/images, components/variants, tokens, flows/player, handoff/code export, native container integration, SDK and collaboration remain later work. P0 uses DOM text rendering with fixed basic style, not measured layout/export parity. Node limit is a validation cap, not a performance promise. History is bounded to 50 transactions; crash recovery restores content, not undo history.

No release, push or spending performed. `tokens.css` and `global.css` untouched.
