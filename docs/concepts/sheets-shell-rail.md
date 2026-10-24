# Sheets studio rail (studio shell v2)

Status: implemented on the shell integration branch. Pattern follows the Documents reference
migration; contract is `docs/concepts/studio-shell.md` section 9. Owner split: this rail/manifest
wiring is the rail task; panel data defs and hosts are the panels task
(`src/lib/sheets/panels.ts`, `src/components/sheets/*`).

## What the Sheets studio declares

`src/lib/studios/sheetsRail.ts` exports the assembled `sheetsShellV2` fragment that
`src/lib/studios/sheets.ts` wires into the manifest:

- `panels`: the studio-agnostic global panels (Files, Search, Versions — reusing the registered
  `code.*` hosts, same as Documents) plus `sheetsPanelDefs` (workbook, analysis, inspector,
  formulas) from the panels task.
- `inspector`: `sheetsInspectorDef` — the generic `shell.inspector` panel with the sections
  `sheets.inspector.cell` and `sheets.inspector.formulas`.
- `defaultLayout`: left side open on Workbook, right side open on the inspector
  (260 / 320 px, matching the Code defaults).

## Rail items

Left rail (`SHEETS_LEFT_RAIL`):

| order | id | icon | kind | target | notes |
| --- | --- | --- | --- | --- | --- |
| 10 | workbook | Table2 | panel | `workbook` | workbook structure/navigation |
| 20 | files | Files | panel | `files` | studio-agnostic |
| 30 | search | Search | panel | `search` | studio-agnostic |
| 40 | analysis | Lightbulb | panel | `analysis` | |
| 50 | versions | VersionsIcon | panel | `versions` | starts in the overflow menu (`defaultPinned:false`) |

Right rail (`SHEETS_RIGHT_RAIL`):

| order | id | icon | kind | target | notes |
| --- | --- | --- | --- | --- | --- |
| 10 | inspector | SlidersHorizontal | panel | `inspector` | generic inspector (cell + formulas sections) |
| 20 | formulas | CodeXml | panel | `formulas` | formulas quick panel |
| 30 | export | Download | command | `sheets.saveCopy` | real command; with no workbook open it answers with its expected notice. `movable:true` |

No rail entry promises formatting: the engine writes values and formulas only, so there are no
format controls (a unit test asserts this).

## Icon mapping

Glyphs come from the shared Vadivam set and resolve through the rail icon registry
(`lib/shell/railIcons.ts`). All names except one are part of the shared set registered by
`components/shell/railIconSet.ts`; Sheets additionally registers `Download`
(`SHEETS_RAIL_ICONS`). Registration is first-wins, so the same name keeps the same glyph in
every studio.

## Customization defaults

The rail is user-customizable (reorder by drag and drop, pin/unpin, hide, move to overflow,
reset — context menu, overflow "more" menu, or the `shell.rail.*` commands). The Sheets defaults:

- pinned: everything except Versions, which starts in the overflow menu (the main rail stays
  lean; one click pins it back);
- order: as listed above;
- overrides persist per studio in the shell layout store (`somnia.shellLayout.v1`).

## Rail tooltips (i18n)

Rail labels use `labelKey` with the `sheets.rail.*` keys in
`src/locales/sheets/rail.{en,de,es,fr,pt-BR}.json`, merged into the catalogues via
`src/lib/sheetsRailI18n.ts` (root lib level, because `lib/i18n.ts` must not import studio libs).
`label` stays the English fallback. The export item reuses the existing `sheets.exportCopy` key.

## Tests and screenshots

- `src/lib/studios/sheetsRail.test.ts` — validator against the real command registry, manifest
  wiring, panel reachability, icon resolution, inspector sections, customization defaults and
  per-side overrides, locale parity of the rail keys.
- `tests/sheets-shell-rail.spec.ts` — Playwright: rails, default panels, inspector sections,
  overflow menu, customization (overflow/hide/show/reorder, persistence across reload), and the
  export quick action downloading a real workbook copy, in light and dark themes.
