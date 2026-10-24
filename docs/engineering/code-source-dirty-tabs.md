# Unsaved source-file tab marker

Source tabs now show an asterisk with an accessible localized "Unsaved source changes" label whenever the store's existing `dirtyFileNames()` includes that file. Previously only image/PDF/Slides media tabs showed dirty indicators. There is no parallel dirty flag, revision heuristic, local-storage baseline or save attempt in the tab component.

The existing editor-core source/save owner determines the status. Unchanged saved text has no star. Changes, including changes to inactive tabs and new empty files with no saved baseline, get a star. Undo back to the saved content clears it. An actual exact saved snapshot clears matching files; an older snapshot cannot clear newer edits. Per-file save clears only the file whose exact saved content matches. Closing/reopening a tab does not change the source or its save state. Project replacement uses the new project's existing baseline.

All open source-file tabs use the same source owner, including those routed to another studio. Media dirty behavior, tab names/paths, close button labels, tab selection and close/save prompts are untouched. The marker is separate from the truncated filename and remains visible. The native save route itself is not newly verified by a browser test; the tab reports existing owner state, not a disk-write guarantee.

Focused tests exercise the existing dirty owner, exact snapshots, owner undo/redo, never-saved empty files, baseline changes and studio scoping. Browser tests cover per-file independence, Light/Dark, save while newer edits exist, close/reopen and project reset. No dependency, new control, command or toolbar area. Native/WASM/packaged desktop verification remains CI-only.
