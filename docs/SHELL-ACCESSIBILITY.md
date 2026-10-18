# Shell accessibility and keyboard model

Scope: the studio shell (menu bar, studio pill, hero slot, icon rails, file tabs, rail menus, status bar). First audit 2026-10-13 on the beta.4 line (`fix/shell-a11y`); ported to the beta.5 shell on `port/a11y-toolbar` (2026-10-18). On beta.5 the rail menu keeps the shared `useMenuFocusReturn` / `tabNav` helpers; the file-tab strip and its menu use the beta.4 roving helpers (`rovingKeys.ts`).

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

`src/lib/shellContrast.test.ts` checks `text-primary`, `text-secondary`, `text-tertiary` and `accent` against every `bg-*` token for each theme and palette in `styles/tokens.css` (WCAG AA, 4.5:1). Fixed in the beta.4 pass: light/blueice (`text-tertiary`, `accent` on hover) and light/melon (`accent` on hover). The test also reads `src/themes/*.css`; nord and nordlight were raised to AA. beta.5 ships its own AA-compliant values for all of these palettes, so the port needed no token changes - the test locks them in.

## Browser audit

`node scripts/a11y-shell-audit.mjs` (from `phase1/`, set `SOMNIA_CHROME` for a system browser) drives the web build in dark and light and checks Tab stops, rail arrows, menu open/close focus and the studio pill. PNGs go to `tests/artifacts/a11y-shell/`.

## Other fixes in pass 3

- Sidebar panels (`LayersPanel`) are named regions (`panels.layers.tab.*`) instead of unnamed `tabpanel`s without tabs.
- Update pill: `emerald-600` with white 10px text was 3.77:1; now `emerald-700` (5.48:1). Download/install progress is announced through a polite live region.
- Hero action: when the button is disabled, its reason is now exposed with `aria-describedby` (a disabled button gets no focus, so the tooltip alone never reached screen reader users).
- RasterEditor toolbar labels use locale keys.

## Known gaps

- Rail drag-and-drop reorder has a keyboard path only through the context menu (Shift+F10) and the `shell.rail.*` commands.
- Extensions popup: Tab order and accessible names checked in all four views; behaviour of every control (install, consent dialogs) not walked. After the last control, base-ui hands focus to the browser, as designed for modal dialogs; in headless Chrome that wraps into the inert app, so this was not asserted.
- Screen reader output was checked through Chrome ARIA snapshots and attribute reads, not with a real screen reader.
- The hero disabled-reason path is covered by code review and typecheck only; no studio in the harness had a disabled hero.
