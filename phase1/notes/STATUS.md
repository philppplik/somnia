# Phase 1 status

This branch is development work, not a shipped desktop release. Existing live Phase-0 files (proto/ and docs/) remain untouched.

Core implemented and locally tested: source-range edits, atomic transactions, origin suppression, shared undo, stable IDs during local visual changes/moves, metadata recovery, class-based external CSS, honest save coordinator.

Pending integration: React19/BaseUI shell, Tauri file service, native builds, end-to-end canvas/save tests, multi-select/resize/spacing/richtext/color tools. Unsupported mixed text/cascade cases refuse visibly instead of destroying source.
