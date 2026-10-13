# Code studio rail (studio shell v2)

The Code studio runs on the studio shell v2: its side rails, panels and inspector are declared as data and rendered by the shared shell. Concept: [docs/concepts/studio-shell.md](../concepts/studio-shell.md) (sections 3.4 to 3.6 and 9). Reference migration: Documents (`lib/studios/documents.ts`).

## Where things live

| Piece | File | Owner |
| --- | --- | --- |
| Panel and inspector data (`codePanels`, `codeInspector`) | `phase1/src/lib/codePanels/shell.ts` | panel wave |
| Rail items, first-open layout, icon registration | `phase1/src/lib/studios/codeRail.ts` | rail wave |
| Rail and inspector strings (5 locales) | `phase1/src/locales/code/rail.*.json`, merged by `phase1/src/lib/codeRail/i18n.ts` into `lib/i18n.ts` | rail wave |
| Manifest wiring (`shellV2`) | `phase1/src/lib/studios/code.ts` | rail wave |
| Hosts (panel and section components) | `phase1/src/components/studios/code/registerShell.ts` via `registerStudioPanels` | panel wave |
| Rail customization engine (reorder, pin, overflow, hide, reset, commands `shell.rail.*`) | `phase1/src/store/railActions.ts`, `phase1/src/store/railCommands.ts` | shell foundation |

## Rails

Left rail keeps the legacy Code order so the migration does not shuffle icons users know, and appends the two new panels:

`layers, files, search, components, css, versions, responsive, outline`

Right rail is the single generic inspector (`panel: 'inspector'`, component `shell.inspector`). Its sections are declared in `codeInspector`: Design, Interactions (collapsed by default), Source (collapsed by default).

Every item is `kind: 'panel'`, pinned by default, with a `labelKey` into the code catalogue. Icons resolve through the shared rail icon registry (`lib/shell/railIcons.ts`, baseline set in `components/shell/railIconSet.ts`). The same function keeps the same glyph in every studio: Outline reuses the `Hash` glyph from the Documents outline. The one Code-specific glyph, `MonitorSmartphone` (responsive panel), is made with `makeVadivamIcon` in `codeRailIcons.ts` and registered there.

No rail item carries a `when` yet. `when` expressions read the StudioContext, and the Code canvas does not publish one, so an expression would hide the item everywhere (missing paths are falsy). The pre-shell domain filtering (markdown disables Layers, empty project shows only Files/Search) is gone with the legacy rail; it comes back per item once the canvas publishes `document.kind`/`mode`.

## Customization defaults

- Declared order is the default order; everything is pinned, so the overflow "More" group starts empty and the More button only appears after the user unpins or hides an item.
- Edits (drag to reorder, right-click for move/pin/hide, reset) live as `railOverrides` in the shell layout store and persist across reloads. One overrides record covers both rails; edits are sided so one rail never disturbs the other.
- First-open layout mirrors the pre-shell studio: Layers open left, the inspector open right (`CODE_SHELL_LAYOUT`).

## Tests

- `phase1/src/lib/shell/codeShell.test.ts`: manifest wiring, validator against the real icon registry, rail/panel coverage per side, customization defaults, sided override edits, locale coverage.
- `phase1/tests/shell-code-rail.spec.ts` (Playwright): rail order and icons, context menu, overflow, reorder persistence across reload, reset; the inspector section test needs the panel wave hosts.

## Known follow-ups

- The four `studio-shell-snapshot.spec.ts` baselines change on purpose: two new icons on the left rail, one inspector icon on the right rail, and the generic inspector replaces the old right-side tabs. Regenerate them with the CI `update_snapshots` input after the panel wave lands.
- The Code canvas should publish a StudioContext (selection, mode, services) so rail items and inspector sections can use `when`.
- The diff-split toggle and the Extensions/Settings/Chat/Agent buttons are still shell-owned JSX in `IconRail.tsx`, not manifest items.
