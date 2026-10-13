# Per-studio hero actions: Code Preview, Documents Export, Sheets Smart Formula

Concepts: [hero-action-code.md](../concepts/hero-action-code.md), [hero-action-documents.md](../concepts/hero-action-documents.md), [hero-action-sheets.md](../concepts/hero-action-sheets.md). Slot mechanics: [header-hero-action.md](header-hero-action.md).

## Code: Preview

The hero dispatches the existing `view.livePreview` toggle; `pressedWhen: 'preview'` renders its pressed state and the pressed tooltip reads "Close live preview". The command is enabled only when the project is connected, an HTML entry page resolves exactly the way `refreshProject` resolves it (never a guessed file), and no framework project is detected (framework startup keeps its separate review). Plain text, JSON and other standalone source files disable the hero; the tooltip explains "No previewable page". Publish stays in the chevron, Project > Publish and the palette.

## Documents: Export

The hero runs `documents.export.open`, which opens a small popup preselected to the one available format, Word document (.docx) "save a copy". The popup shows the copy file name, the copy semantics and the engine's fidelity warnings. Saving dispatches the now-registered `documents.saveCopy` command, which wraps the single risk-gated save path in `lib/documents/exportBridge.ts`: unsupported-content risks always open the existing warning with its explicit "Save anyway" confirmation, from every entry point (toolbar button, popup, Project menu, palette). The copy never overwrites the opened document and never clears its dirty state. There is no fake PDF option. Disabled with "No document open" when nothing is loaded or a save is running.

## Sheets: Smart Formula

The hero runs `sheets.formulas.open`: it reveals the existing formula builder panel (never toggles it closed), seeds its source range from the live selection instead of the persisted default and focuses the function field. Repeated clicks only re-focus. Target safety in the builder:

- No write on the first click, and no guessed target: the target cell starts empty and Apply stays disabled until the user picks an output cell outside the source range (or clicks "Use current cell").
- A non-empty target is read back first and asks "Replace its content?" before anything is written.
- Apply settles pending grid/formula-bar edits, navigates to the reviewed target (visible, user-chosen), verifies the selection actually landed there, then dispatches `sheets.setCell` exactly once. Undo is `sheets.undo`. Read-only contexts and an unavailable engine keep Apply disabled.
