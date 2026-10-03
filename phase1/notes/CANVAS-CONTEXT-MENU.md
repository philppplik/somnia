# Canvas context menu

Right-click on an element in the design canvas selects it and opens a menu: Select, Move up, Move down, Hide/Show layer, Lock/Unlock layer. Same operations as the layer menu (PR #4): shared core transactions and undo, metadata actions leave authored HTML/CSS unchanged, locked elements cannot move.

- Component: `src/components/CanvasContextMenu.tsx`, opened from the iframe `contextmenu` listener in `DesignCanvas.tsx`.
- Positioned in the app document (fixed), scale derived from the iframe's rendered size, clamped to the viewport.
- Closes on Escape, outside click or after an action. Right-click on empty page area closes it.
- Test: `tests/canvas-context-menu.spec.ts` (hide, undo, Escape). Full Chromium suite: 25 pass.
- Not done: keyboard-only open (Shift+F10 inside the iframe), insert/delete/duplicate actions, native OS menu.
