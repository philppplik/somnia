# Web build acceptance checklist (Chrome on Windows)

Run against `npm run dev` (http://localhost:1420) or any HTTPS deployment. Tick each line; note the browser version.

## Folder access (Chromium only)
- [ ] Open folder (Ctrl+O) shows the browser folder picker and the project name appears in the status bar with a green dot and "On disk".
- [ ] Edit a file, press Ctrl+S: status shows saved only after the write; the file on disk has the new content.
- [ ] Change the same file in another editor, then save in Somnia: a conflict notice appears and nothing is overwritten.
- [ ] Reload the page: "Reconnect last folder" appears; one click and a permission prompt restore the project.
- [ ] Deny the permission prompt: a clear notice, no crash, edits stay in recovery.
- [ ] Close the tab with unsaved edits and reopen: the recovery snapshot is offered.

## Firefox / Safari fallback
- [ ] Open folder asks for a ZIP; the status bar shows an amber "Tab copy" and the notice says changes stay in the tab.
- [ ] Export source ZIP downloads the edited project.

## Editor and shell
- [ ] Click an element in the preview: the code editor selects its source range.
- [ ] Right-click the code editor: Undo, Redo, Cut, Copy, Paste, Select all work.
- [ ] Right-click a layer and the canvas: context menus open at the pointer and close with Escape.
- [ ] Tab key reaches every control with a visible focus ring; Arrow keys move inside the icon rails.
- [ ] Settings > Extensions: pasting a manifest with an unknown permission shows an error, a valid one installs.
- [ ] Settings > Code editor: all syntax themes apply to the editor.

## Known not covered here
Frameless window drag, snap and edge resize, and Ctrl+W exist only in the desktop shell and need a real Windows run.
