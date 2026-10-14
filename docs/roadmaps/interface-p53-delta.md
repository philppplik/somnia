# Interface P53 Delta — Keyboard shortcuts cheatsheet dialog

## What changed
- **Single source of truth**: new `src/lib/interface/shortcuts.ts` lists the real Interface canvas keyboard surface as data (`INTERFACE_SHORTCUT_ENTRIES`: arrows/Shift/Alt move and resize, Mod+Z/Y undo/redo, Mod+A/C/V/D, Del, Enter/Space, Esc, Shift+Click, ?) plus `formatInterfaceShortcut` which renders Mod as ⌘ on macOS and Ctrl elsewhere.
- **Dialog**: new `InterfaceShortcutsDialog` — role="dialog", aria-modal, labeled, focus lands on the panel, closes on Esc (capture-phase, so canvas handlers never see it), backdrop click or the DS close button, and restores focus to the invoking element on unmount.
- **Entry points**: `?` on the canvas (behind the existing input/button guards) and a `Keyboard shortcuts` ghost button in the studio footer.
- **i18n**: title, close and all 14 row labels in all five locales (Tastaturkürzel/Schließen).

## Tests
- `p53Shortcuts.test.ts` (3): entries unique + every label resolves in all five locales, platform formatting, coverage of every real canvas binding.
- `InterfaceShortcutsDialog.test.tsx`: dialog semantics (role, aria-modal), localized rows, Ctrl combos, kbd markup, EN and DE.
- CI spec: `?` opens the dialog from the canvas, row and combo visible, Escape closes; footer button opens, Close closes.
- Suite: 429 pass / 0 fail; check:ds, check:ui-commands, check:commands, check:layers all green; tsc clean (only known slides-engine WASM noise).

## Screenshots
Light EN and dark DE previews inspected: dialog open over the Gallery frame, all rows localized, footer entry visible.

## Notes
- The list is honest about the canvas-level bindings (which bypass the command registry); interface commands currently register no shortcuts, so the manifest contributes nothing yet — entries stay data-driven for a future merge.
- The focused dialog panel keeps the DS accent focus ring deliberately (visible focus indicator, consistent in both themes).
- Focus trap is minimal (single close control, Esc/backdrop exit); full trap out of scope.
