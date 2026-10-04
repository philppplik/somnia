# v9.6.2 - Empty start, project menu, export (technical notes)

- **No starter project.** Production starts with an empty state (Open folder / Open file / New blank page) or restores the last unsaved session (draft, `somnia.draft.v1`). A sample project exists only in the dev build for automated tests (`localStorage somnia.fixture=starter`, set by `tests/fixtures.ts`).
- **Project menu:** Open folder, Open file, Save project, Export project, Close project. "Reset to starter project" was removed. "Compare with disk" is no longer in the Project menu; it stays as the conflict helper "Resolve conflict: compare active file with disk" (Tools), because the conflict notice points to it.
- **Open file / drop:** `lib/projectActions.ts` `addTextFiles` adds text files (html, css, js, json, svg, txt, md, max 2 MB) to the open project or starts an in-memory project. Saving such a project goes through the Save dialog.
- **Save dialog:** option "Create a new folder named <project>" (desktop `choose_project` gets `create_subfolder`, validated as a single path segment; web port creates the sub directory handle).
- **Export dialog:** ZIP, Folder (copy, never overwrites), Single HTML (inlines local CSS/JS, `inlineHtml`), Markdown. The open project and its save state stay unchanged.
- **Close project:** disk projects keep autosave and recovery; in-memory projects with edits ask (Save / Discard / Cancel).
