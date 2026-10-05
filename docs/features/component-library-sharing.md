# Component library sharing

Builds on [component-system.md](component-system.md). Slice `comp/library-sharing`.

## What it does
- **Export** the personal library as a JSON file (`somnia-components-YYYY-MM-DD.json`). `data-somnia-*` marker attributes are stripped.
- **Import** a JSON file. The file is validated first; bad entries are skipped and counted, wrong files are refused with a plain message. Nothing changes if the import fails.
- **Project library**: `somnia-components.json` in the project root. "Save library to project" writes it (create or replace, one undoable edit, saved with the project). "Load library from project" merges it into the personal library. Root file name, because `.somnia` is reserved by the native folder walker and dot-files are skipped by the web folder walker.
- **Merge conflicts**: a conflict is a component whose name already exists (case-insensitive) with different content. Identical components are skipped, new ones are added. For each conflict the user picks: Keep both (new one renamed "Name (imported)"), Merge variants into mine, Replace mine, Skip. Default is Keep both. Id clashes are fixed silently with fresh ids.

## File format (version 1)
```json
{"format":"somnia-component-library","version":1,"exportedAt":"ISO date","components":[{"id":"","name":"","defaultVariantId":"","variants":[{"id":"","name":"","html":""}]}]}
```
Newer versions are refused with "Update Somnia". Limits are those of the component system: 40 components, 8 variants each, 100 KB per variant, 4 MB per file.

## Code
- `phase1/src/lib/libraryShare.ts`: pure logic (format, parse, plan and apply merge).
- `phase1/src/lib/libraryShareActions.ts`: download, file read, project read/write, storage merge.
- `phase1/src/components/LibrarySharePanel.tsx`: UI, mounted at the end of `ComponentSystemPanel` (one added line plus import).
- Tests: `src/lib/libraryShare.test.ts` (18), `tests/library-share.spec.ts` (2).

## Known limits
- Merge and import are atomic: if a component or variant limit would be exceeded, nothing is imported.
- The project file is not watched. After changing it outside Somnia, press "Load library from project" again.
- "Replace mine" keeps the local component id, so existing placed blocks still match.
