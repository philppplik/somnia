# Coding Quick Open

Ctrl/Cmd+P or Tools > Navigation > Quick open project file opens a compact file picker. It searches paths of text files already loaded in the current project. It does not read disk, search file contents, include media previews or create an index outside that project. The current file appears first for an empty query.

Ranking prefers an exact basename, exact path, basename prefix and substring before ordered fuzzy matching. Matching is case-insensitive; the actual path spelling is preserved. Arrow keys, Home and End select a row; Enter opens it. Clicking a row also opens it. A suffix such as `src/app.ts:20:5` requests line 20, column 5; `:20` uses column 1. Positions beyond a file are clamped by the source editor, including empty files. Numeric suffixes must be positive safe integers up to 10,000,000. Invalid suffixes show an error rather than opening a different file.

Limits: 5,000 project paths, 512,000 total path characters, 256 query characters. Results show the first 100 ranked paths and report the full match count. Oversized path sets show no partial index. The file tree remains available.

The picker pins its host, project generation and source snapshots. Before opening a path it checks the exact chosen file still exists unchanged and belongs to the reviewed result set. A replaced project/host, changed chosen source or unconfirmed active editor draft refuses navigation. Unrelated source edits do not invalidate a chosen unchanged file. A list does not update while open; close and reopen to refresh newly added paths.

This is navigation only, including in read-only editors. It never changes source or creates an undo entry. The command accepts no file parameter and agent/MCP origins are refused. The app/store owns the position-reveal port; the low-level model and picker do not import the application store.

Focused verification covers ranking, limits, query parsing, stale state, empty files, readonly navigation, keyboard selection and exact line/column targets. Browser tests compare canonical and editor buffers and inspect Light/Dark screenshots. Native, WASM and packaged desktop checks remain CI-only. The known generic Core command test issue with docs.open's required id is unrelated and handled separately by integration.
