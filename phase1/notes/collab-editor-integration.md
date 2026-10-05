# Collaboration: editor integration (host side) and design-view mapping

Branch `collab/editor-integration`, based on PR #108 (ADR-005 spike). Status: behind a flag, host side only, no network yet.

## What exists
- `src/lib/collab/collabDoc.ts` - one shared project. `Y.Map<path, Y.Text>`, same layout as the spike so its relay can be plugged in later.
- `src/lib/collab/attach.ts` - binds the CodeMirror editor to the shared text of the open file with `y-codemirror.next` (shared cursors and selections via awareness, shared undo). HTML files only (`.html`, `.htm`).
- `src/lib/collab/session.ts` - the active session of this window. `startHostSession()` / `stopSession()`.
- `src/lib/collab/flag.ts` - off by default. On with `localStorage.setItem('somnia.collab','1')` then reload.
- `src/lib/collab/textSync.ts` - turns a whole-file text into one small change on the shared text.
- `src/lib/collab/paths.ts` - path checks. Keys in the shared map come from guests, so unsafe ones (`../x`, absolute, backslash, drive letters) are refused and skipped by `snapshot()`.
- `SourceEditor.tsx`: three small additions (a compartment, one effect, two imports). With the flag off nothing is bound and behaviour is unchanged.

## How the editor stays in sync
1. Attach: the shared text is seeded from the file on the host if it is new. The editor text is set to the shared text, then the binding starts. This first set is not counted as a user edit.
2. Typing (local or remote) changes the editor document. The existing `updateListener` already forwards doc changes to the app store with `replaceSource`, so Layers, the preview and the Problems panel follow remote edits without new code.
3. Store to editor (existing diff-and-dispatch effect) is a no-op when texts are equal, so there is no echo loop.

## Design-view edit mapping (design)
The design view (canvas, inspector, align tools) edits through `applyOperations`, which ends in a `replaceSource` with the whole new file text. Written naively into the shared text that would be "delete everything, insert everything", and would wipe a concurrent edit by someone else.
Mapping: `applyTextToYText(ytext, newText)` computes the common start and end of old and new text and applies only the changed middle as one delete plus one insert. Two people changing different parts of the file merge. If both change the same spot, Yjs orders them and both texts stay in the file (no silent loss).
Where it plugs in: when the editor is bound (the normal case, the code view is mounted), design edits already flow through the editor dispatch and the binding does the same minimal change. `CollabDoc.setText(path, text)` is for when the code editor is not mounted (design-only view, file not open in a tab). That wiring (calling `setText` from the `replaceSource` path of the store for files not bound) is NOT done in this slice, to avoid editing the shared store; it is a few lines and should be the first follow-up.
Not solved: stable element ids. The design view finds elements by ids that come from parsing. After a remote edit the parse changes, so ids of elements after the edit may shift and a selection in the design view can jump. Proposal: re-select by tag path plus index after a remote change, or by Yjs relative positions (`Y.createRelativePositionFromTypeIndex`) kept for the selected element start.

## Tests
`npm run test:core` (new: `src/lib/collab/collab.test.ts`, 8 tests): minimal edit round trips (300 random cases, emoji safe), design edit plus concurrent edit elsewhere merge, no update when text is equal, unsafe paths, HTML only, concurrent structure breaking converges and stays visible. `tsc --noEmit` passes.
Not tested automatically: the CodeMirror binding in a real browser (no browser available in the build sandbox). Needs a manual run, see below.

## Manual test (Windows build)
1. Open dev tools (Ctrl+Shift+I), run `localStorage.setItem('somnia.collab','1')`, reload.
2. Open an HTML file, run `__somniaCollab.start()`.
3. Type in the editor, then run `__somniaCollab.text('index.html')` (use your file's path): it must equal the editor text.
4. Move or edit an element on the canvas: the shared text must show the same change; `__somniaCollab.snapshot()` shows all bound files.
5. With the flag off (or without `start()`), the editor must behave exactly as before: typing, undo, save.
Expected limits: no second person can join yet (no transport), undo with a session running is the shared undo.

## Risks
- Undo/redo: `yCollab` adds its own undo keys. Not checked against the existing menu's Undo/Redo entries, which call CodeMirror's `undo`.
- Switching files while a session runs rebinds the editor; each file is its own shared text.
- Disk save while a session runs: still the existing save path of the host. Guests' edits reach disk only through the host text.
- Browser-only version: `y-codemirror.next` adds roughly 30 KB; fine, loaded in main bundle for now.
