# CA1 Delta — Context-aware cross-studio suggestions (Slides table ↔ Sheets)

**Status:** first slice delivered (Slides table → Sheets studio, with round trip). **Base:** `origin/int/beta5` (`b7060d58`) + P57 + AE1; stacks on both.

## What landed
- Shared handoff registry (`phase1/src/lib/handoff/registry.ts`): studio object refs, route registry for future "Open in …" suggestions, per-file origin tracking and pending round-trip payloads. Pure, unit-tested.
- Slides table → Sheets: quiet ghost row above the table editor offers **Edit in Sheets studio**; the table is written to a real `.xlsx` (numbers typed), opened as a new media file and routed to Sheets automatically.
- Sheets → Slides: when a workbook carries a handoff origin, a one-line bar (**Back to Slides**) saves the sheet and stashes a pending return; the deck side shows the changed-cell count and applies only on explicit **Apply to table** (one command per cell = one undo step each, bounded to the table's current extent; growth is reported as skipped, never silently applied).
- Diff/apply helpers (`slidesTable.ts`, `applySlidesTableReturn.ts`) are pure and unit-tested, incl. xlsx round-trip through `readXlsx`/`writeXlsx`.
- i18n: `handoff.*` catalogues for en/de/es/fr/pt-BR merged via `phase1/src/lib/i18n.ts`.
- New UI components: `SlidesTableHandoff`, `SheetsHandoffBar` (small, DS primitives only).
- Fixture `slides-engine/fixtures/table.pptx` (independent.pptx + one 2×3 table) and CI spec `phase1/tests/handoff-ca1.spec.ts` covering the full flow with the real engines: select table → open in Sheets → cells present → edit → return → count shown → deck unchanged → apply → deck updated.

## Verification
- Unit: 243/243 (handoff, slides, sheets, office, export, photos-export suites).
- Gates: `check:commands` clean; `check:ds` and `check:ui-commands` fail only on pre-existing upstream items (Sound studio raw controls; `cmd.photos.applyVersion` title) already present at clean tip `b7060d58`.
- Pixels: isolated fixture `phase1/test/handoff-preview.tsx` (engines are CI-only) ran the full interactive round trip in Chromium, light/EN and dark/DE; 8 screenshots under `ca1-*-{1..4}-*.png`.

## Deliberately out of scope (next slices)
- Command-palette entries for routes (UI-first slice).
- Further route kinds: Slides image → Photos, audio → Sound, chart → Sheets.
- Docs/Sheets-originating suggestions.

## Known limits
- Full `tsc --noEmit` not run locally (wedges this sandbox since the rebase; CI covers it).
- Round-trip writes back cell text only; Sheets formatting does not map to table fills.
