# Native folder drop

Branch: `feature/folder-drop`, based on v9.18.0 / `8fb685e`.

## Behavior

- Drop one folder anywhere in the desktop window to open it as a disk project.
- Drop one file to open and save it in place, like Project > Open file.
- Drop multiple text files to import copies, like the previous browser drop route.
- Multiple folders and mixed folder/file selections are refused. Drop one folder alone.
- Dirty projects ask before replacement. Cancelling leaves the current project alone.
- Candidate files are read and parsed before disconnecting the old project. A failed read, parser failure, project lock or expired drop leaves it open.
- Edits made while a candidate is loading abort the switch. Drop again.
- Same-folder drops can hit the existing project lock; they leave the current project open.
- Browser file import is unchanged. Browser folder drop is not implemented.

## Native boundary

Tauri drag/drop is enabled in all four desktop configs. The OS event is handled in Rust for the trusted `main` window only. Rust retains the delivered paths and emits `somnia://os-drop` with `{token, count}`. The frontend never submits filesystem paths.

`open_dropped_project({token})` consumes a single-use random grant valid for 120 seconds and opens exactly one OS-delivered directory or file through the existing capability-rooted Project service. Project limits, locks, recovery, autosave and path-traversal protection are unchanged.

`read_dropped_files({token})` consumes the same kind of grant for multiple file imports. It rejects directories, filters supported extensions, requires UTF-8, limits input to 64 paths, 2 MB per file and 8 MB total. No filesystem-plugin permission or ambient renderer path API was added. Both commands are listed in build.rs, the main invoke handler, and editor.json.

Only the newest drop grant survives. A second drop while a project is loading is refused. The user can drop again after the current operation finishes. Close-window guarding remains unchanged.

## Why Layers drag changed

On Windows, native Tauri drops and HTML5 drag/drop are mutually exclusive. Enabling folder drop without another change would break the Layers tree. Layers now uses pointer events, a six-pixel drag threshold, pointer capture, and elementFromPoint target picking. Before/inside/after zones and the existing move planner are unchanged. Escape, pointer cancellation and lost capture cancel. A completed drag suppresses its following selection click. Existing keyboard move/indent/outdent buttons remain.

Sources checked:
- https://v2.tauri.app/reference/javascript/api/namespacewebview/
- https://github.com/tauri-apps/tauri/issues/13171

Canvas already uses pointer events and did not need changes. Browser Layers tests now drive real pointer movement rather than HTML5 dragTo.

## Tests and remaining checks

Automated coverage includes single-use grants, forged/expired grants, oversized grants, mocked native folder and file opening, multi-file imports, dirty replacement cancellation, unreadable candidate cleanup, Layers order/nesting/undo/descendant protection, Escape cancellation, small movement selection, and canvas dragging.

Native event delivery still needs a real Windows test. Browser mocks test the IPC flow but cannot prove Explorer/WebView2 event delivery. The development container lacks GTK/WebKit development libraries, so Linux desktop cargo check cannot finish here. A Windows GNU cross-check also stops at the unavailable MinGW C compiler. Run native desktop CI before merging.

## Windows test list

1. Drag a folder with index.html and CSS from Explorer onto the window. Check name, Files panel, preview and On disk status. Edit, Ctrl+S, reopen in an external editor and check bytes.
2. Make an unsaved memory project. Drop a folder, choose Cancel and verify all edits stay. Repeat and accept.
3. Drop a single HTML file; edit/save and confirm the original file changes, not a new copy.
4. Drop two text files; confirm copies import. Drop two folders or a folder plus a file; confirm a clear error and unchanged current project.
5. Drop a locked/unreadable folder and the already-open folder; check the current project stays usable.
6. Drag Layers before/inside/after another layer, undo, press Escape mid-drag, and try a locked node or descendant. Keyboard move buttons still work.
7. Move an element in the canvas and use menus/settings. Native folder drop must not affect canvas pointer moves.
8. Repeat folder/file drops with spaces and umlauts in names. Check the hover overlay clears on leaving the window and dropping.

## Validation run

- TypeScript typecheck and production build pass (existing chunk-size warnings remain).
- Core tests: 145 passed.
- Rust without desktop dependencies: 2 drop-grant tests and 20 file-service tests passed.
- Focused browser suite: 21 tests covering folder drop, Layers pointer moves, canvas moves, existing native adapter behavior, empty start, browser file import and browser folder saves.
- Inspected screenshots of the full-window drop overlay and a Layers inside-target outline; text and drop hints fit the current design. Screenshots use the browser test harness, not a real Windows build.
