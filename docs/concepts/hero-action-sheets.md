# Sheets Studio hero action: Smart Formula

Status: design proposal, not implemented. Philipp reviews this before development.
Research checked: 2026-10-13. Repository baseline: `int/shell` at `e2a188d3`.

## Recommendation

Use **Smart Formula** beside Account. Open and focus the existing Formula builder
panel directly, seeded from the selected range. Do not write a cell on the first
click. The first version is a deterministic local formula helper, **not** a cloud
AI prompt and not a claim to generate arbitrary formulas from natural language.

## Product evidence and alternatives

- Excel places AutoSum in Home and Formulas, detects a source range, inserts a
  formula and lets the user confirm it with Enter [1]. Range inspection is part
  of the workflow, not a hidden calculation.
- Google Sheets gives formula/range suggestions and a help box with syntax and
  examples. Users can accept or reject suggestions [2].
- Automate Excel documents Excel's function icon beside the formula bar, followed
  by function search and arguments [3]. It is a specialist tutorial dated 2021;
  use it as supporting interaction evidence, not current product authority.
- Community discussion about overwritten formulas reinforces the need for visible
  targets and deliberate application [4]. It is anecdotal, not a prevalence measure.

These are in-sheet/ribbon/formula-bar patterns, not proof of a top-right hero.
Somnia promotes that studio-specific job into its shared hero slot. **Export**
remains available but the next useful editing step is often constructing a formula.
**Analyze** is a useful secondary panel; its read-only statistics do not create a
formula. **AutoSum** alone would be narrower than the existing six-function builder.

## UX and states

1. Clicking Smart Formula reveals the existing `formulas` panel and focuses its
   first field. Repeated clicks focus it, never toggle it closed or apply twice.
2. Seed the source from the current valid range, not the persisted A1:A10 default.
   The existing "Use selection" control can re-seed it later. Keep subsequent
   manual edits until the user explicitly chooses another source.
3. Offer only functions the builder already supports: SUM, AVERAGE, MIN, MAX,
   COUNT and COUNTA. Show the generated formula as editable/reviewable text in
   the appropriate builder UI, the source range and an explicit output cell.
   General syntax assistance is a later scope, not shipped functionality.
4. The current builder writes to the active cell and blocks direct self-inclusion.
   A selected source range often includes that cell. **Do not apply by default**:
   ask the user to choose an output cell outside the source. Any adjacent-empty
   cell suggestion needs validation and review; never guess an overwrite target.
5. Before Apply, resolve pending grid/formula-bar edits and revalidate workbook,
   sheet, target and source. Freeze a reviewed target identity or invalidate the
   proposal if selection changes. The existing `sheets.setCell` takes only input
   and writes to the *current* cell, so this check is a real implementation need.
6. Apply dispatches `sheets.setCell` once after review. Warn before replacing a
   nonempty cell. Undo uses `sheets.undo`; no save, export or server action occurs.
   Preserve engine protections and reject read-only/busy/unavailable states.
7. No workbook or cell: disabled Smart Formula with an accessible reason. An
   unsupported/oversized source or self-reference disables Apply with inline
   guidance, but the open panel remains usable to correct it.
8. Keep everything local. An AI variant would need separate provider, disclosure,
   permission and proposal-review design; no hidden request from this button.

## Existing commands and code

| Command/item | Current fact | Proposed reuse |
| --- | --- | --- |
| `sheets.setCell` | Real UI command, payload `{input}` | Apply the reviewed formula once, with target revalidation |
| `sheets.navigate` | Real UI command, `{sheet,address}` | Explicit target choice; do not silently move the selection |
| `sheets.analyzeRange` | Real read-only range command | Optional source inspection, not an auto-apply path |
| `sheets.undo`, `sheets.redo` | Existing workbook history commands | Preserve engine-owned history |
| `sheets.saveCopy` | Existing workbook copy/export command | Keep Project > Export and current export rail affordance |
| `formulas` panel / `sheets.formulas` host | Existing builder, shared with inspector section | Reuse one controller/state; avoid a second builder |

Grounding: `phase1/src/lib/sheets/panelController.ts`, `commands.ts`, `panels.ts`,
`panelModel.ts`, `components/sheets/SheetsPanels.tsx` and `SheetsCanvas.tsx`.
A proposed `sheets.formulas.open` UI command is **new**: reveal/focus the declared
panel through the existing panel-layout mechanisms. No existing command with that
name was found. Keep it UI-only; opening the hero is not permission for an external
agent to write a cell. Target stability/overwrite safeguards need hardening beyond
merely connecting a header button.

## Shell boundary and Publish

One generic slot beside Account reads a future optional manifest descriptor;
there is **no hero-action field today** in `StudioShellDef`. The shell owns only
layout, icon/label and command dispatch, without Sheets branches or engine imports.
The studio owns readiness, source/target context and panel focus. Preserve all
existing panel, menu, rail and context contracts. The existing formula rail remains
an alternate entry point to the same panel; it is not a second tool or duplicate
header control. Coordinate compact/overflow behavior with the shared shell owner.

Publish stays in Project > Publish (`deploy.open`), palette and the existing
desktop shortcut. It refers to the web project, not XLSX hosting. Keep current
availability gates and deployment confirmation. Removing the universal header
spinner must not hide progress of an already running deployment.

## Effort and acceptance

Planning estimate after the shared slot exists: 0.5-1 day for a simple panel-open
command; 1-2 additional days for reviewed target identity, edit settlement,
overwrite protection and tests. This safety work is part of the proposed hero's
acceptance, not optional polish. Natural-language AI is excluded.

Acceptance: first click makes no workbook changes; correct six functions; current
selection seeding; circular and oversized ranges; nonempty target confirmation;
selection/tab/studio switch invalidates stale proposals; pending edit handling;
Apply once; Undo; read-only/busy; five locales; keyboard focus; Publish/export
reachability; light/dark and compact screenshots. No implementation or visual
validation is claimed by this concept.

## Sources

[1] Microsoft Support, "Use AutoSum to sum numbers in Excel", official,
no date shown: https://support.microsoft.com/en-us/excel/use-autosum-to-sum-numbers-in-excel

[2] Google Docs Editors Help, "Add formulas & functions", official,
no date shown: https://support.google.com/docs/answer/46977?hl=en

[3] Automate Excel, "How to Insert Function (Dialog Box) in Excel & Google Sheets",
specialist tutorial, 2021-11-09:
https://www.automateexcel.com/how-to/insert-function-dialog-box/

[4] r/excel, "How to prevent users from breaking formulas and best practices for
cloud deployment?", community discussion, 2026-08-20:
https://www.reddit.com/r/excel/comments/1vta2x7/how_to_prevent_users_from_breaking_formulas_and/

Roadmap-Delta: add review-gated Smart Formula entry to the existing builder, with
stable-target and overwrite safeguards; no new AI service or formula engine.
