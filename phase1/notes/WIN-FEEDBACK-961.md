# v9.6.1 - Windows feedback round (technical notes)

## Update pill
The check ran once at app start, so a session started before a release was published never saw it. Now `UpdatePill` checks at start, every 30 min and on window focus (throttled to 10 min), with `cache: 'no-store'`. The outcome is stored in `somnia.updateCheck.last` and shown in Settings > Updates ("Last automatic check ..."), including the error text if GitHub or the network failed. Links open through `open_external` (desktop) because `target=_blank` is unreliable in the Tauri webview.

## `open_external` (desktop)
Allow-list: only `https://github.com/philppplik/somnia` and sub-paths. Uses `rundll32 url.dll,FileProtocolHandler` (Windows), `open` (macOS), `xdg-open` (Linux); the URL is a single argument, no shell.

## Problems panel
`src/lib/diagnostics.ts`: `lintState` (shared with the editor gutter), `computeDiagnostics(file,text)` and `projectProblems(files)` (HTML, CSS, JS/TS; capped at 50 per file, 500 total; errors first). The panel re-lints 300 ms after edits stop. A click calls `jumpToLine(file,line,col)` (store field `jumpTo`), which opens the tab and places the cursor; search results use the same jump.

## Save dialog (Ctrl+S on a project that is not in a folder)
`project.save` is always enabled. With a folder project it saves as before. Otherwise a dialog offers "Choose folder and save" or "Download ZIP instead". The folder flow (fileAdapter `saveToFolder`): pick a folder, refuse when any project file already exists there (nothing is overwritten), write each file with read, stage, save (Rust creates missing sub folders), then continue as a normal disk project with autosave. ZIP-import tabs (browser, no disk) download a ZIP on Ctrl+S.

## Chrome
Left rail bottom: Extensions (opens Settings > Extensions) and Settings. Help > "Somnia on GitHub". Settings section is now store state (`settingsSection`).
