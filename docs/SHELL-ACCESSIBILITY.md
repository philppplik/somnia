# Shell accessibility and keyboard model

Scope: the studio shell (menu bar, studio pill, hero slot, icon rails, file tabs, rail menus, status bar). Audit date 2026-10-13, branch `fix/shell-a11y`.

## Keyboard model

| Widget | Keys |
| --- | --- |
| Menu bar (base-ui menus) | Enter/Space/ArrowDown opens, arrows move, Right/Left enter and leave submenus, Escape closes and returns focus to the trigger |
| Studio pill | radio group: arrows change studio |
| Icon rails (`role=toolbar`) | one Tab stop per rail; Up/Down/Home/End move focus (`useRovingToolbar`) |
| File tabs (`role=tablist`) | one Tab stop; Left/Right/Home/End move focus, Enter/Space activates, Delete closes, ContextMenu or Shift+F10 opens the tab menu |
| Extensions popup nav (`role=tablist`, vertical) | one Tab stop; Up/Down/Home/End move focus and select; Esc closes the dialog |
| Rail menu and tab menu (`role=menu`) | focus moves into the menu on open; Up/Down/Home/End move; Escape or Tab closes; focus returns to the opener |

Helpers: `src/lib/rovingKeys.ts` (navigation maths, pure and unit tested) and `src/lib/rovingToolbar.ts` (Tab stop selection).

## Contrast

`src/lib/shellContrast.test.ts` checks `text-primary`, `text-secondary`, `text-tertiary` and `accent` against every `bg-*` token for each theme and palette in `styles/tokens.css` (WCAG AA, 4.5:1). Fixed in this pass: light/blueice (`text-tertiary`, `accent` on hover) and light/melon (`accent` on hover). The test also reads `src/themes/*.css`; nord and nordlight were raised to AA.

## Browser audit

`node scripts/a11y-shell-audit.mjs` (from `phase1/`, set `SOMNIA_CHROME` for a system browser) drives the web build in dark and light and checks Tab stops, rail arrows, menu open/close focus and the studio pill. PNGs go to `tests/artifacts/a11y-shell/`.

## Known gaps

- Sidebar `tabpanel` has no accessible name and no matching tabs; a `region` or `complementary` label would be more accurate.
- Rail drag-and-drop reorder has a keyboard path only through the context menu (Shift+F10) and the `shell.rail.*` commands.
- `RasterEditor.tsx` still has English "Toggle sidebar" / "Toggle inspector" tool labels (not part of the shell).
- Audit script: the Extensions popup check covers nav, labelling and Esc. Cards, detail and activity views were not walked by keyboard.
