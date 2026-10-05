# Open file with save in place, and folder drop (design)

Status: design. Not built, needs a decision before native work.

## Current state
The native backend (service.rs) is folder based: a Project is rooted at one directory, paths are checked by safe_path, edits are staged and saved with conflict detection. Open file today reads the file in the web layer and creates an in-memory project (no write back).

## Options for "Open file, save in place"
A. Single-file project: the backend gets a `choose_file` command that roots the Project at the file's parent folder but exposes only that one file (an allow-list inside Project). Saves go to the same path with the existing conflict check. Linked CSS/JS in the same folder stay invisible (no live preview of them) unless the user opens the folder.
B. Parent-folder project: root at the parent folder and open the file in a tab. Simple and consistent, but exposes sibling files that the user did not choose.
C. Keep today's behavior and add "Save as" only.

Recommendation: A for privacy and least surprise, with a one-click "Open containing folder" action. Rust changes are limited to the allow-list and one command; the frontend change is the Project menu entry and a path badge.

## Folder drop
Drop of a folder onto the window should call the same path as Open folder. Tauri's drag-drop handling is off in the webview (documented gotcha), so this needs the Tauri drag-drop event on the window plus a path check in the backend (only directories, same safe_path rules). Risk: Windows paths and permission prompts; test checklist for Philipp.

## Tests
Rust unit tests for the allow-list (rejects siblings, `..`, symlinks out of the folder); Playwright covers the frontend with the fake adapter. Real file dialogs only on Windows by hand.

## Status
Implemented option A: backend `Project::open_file` (single-file project, allow-list, non-recursive watcher), `choose_file` Tauri command, desktop-only `Open file` command in the file adapter. Web keeps the old in-memory open. Real file dialogs are only testable by Philipp on Windows.
