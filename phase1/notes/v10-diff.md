# Diff viewer (v10 foundation)

- Command palette: "Compare files (diff viewer)..." (Tools). Display only; it never changes a file.
- Left and right pick from "Last saved: <file>" or "Current: <file>" for every project file. Default: last saved vs current text of the active file. Never-saved files count as empty on the saved side.
- Side-by-side or inline view, summary (added/removed/changes), Next/Previous change.
- Built on lib/sourceDiff.ts (LCS, bounded for large files: over 250k line pairs shows "too large"). Pure helpers in lib/diffView.ts (changeStarts, sideBySide, diffStats) with unit tests.
- Not yet: comparing with the file on disk from the dialog (still "Resolve conflict" under Tools), word-level highlights, accepting hunks.
