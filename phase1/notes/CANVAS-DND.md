# Canvas drag and drop

Press an element in the design canvas and move more than 6 px: a drop indicator follows the element under the pointer (line above = before, line below = after, dashed box = inside; top 30% / bottom 30% / middle, same as the Layers panel). Release to move. Escape cancels. A short movement stays a normal click.

Implementation: `src/lib/canvasDrag.ts` listens to pointer events in the preview iframe and calls `dropLayer` (the Layers planner in `layerDrop.ts`), so locked layers, html/head/body, moves into itself and invalid targets are refused exactly like in Layers, and one Ctrl+Z restores the old position. The source is changed through the normal `move` operation (a source patch, no DOM mutation).

Tests: `tests/canvas-dnd.spec.ts` dispatches the pointer sequence inside the frame, because Playwright's real mouse hangs on drags inside the sandboxed iframe in headless Chromium (also without this feature). Please try it with a real mouse on Windows.

Limits: no auto-scroll while dragging, no drag preview ghost, no touch-specific handling beyond pointer events, keyboard alternative stays in Layers (move up/down, indent/outdent).
