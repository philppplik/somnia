# Highlighted source diff

Feature branch: feature/source-diff, based on Foundation8f20a05, independent of layer-context PR4.

Adds read-only line diff above the disk/editor/reviewed-result controls. Disk lines (-) and editor lines (+), explicit signs and line numbers supplement color. All source is React-escaped text, never interpreted as HTML. The reviewed result and native expected-revision save guards are unchanged. Diff is not a three-way merge or a review of the user's result field.

LCS computation stops above 250,000 line pairs or 500,000 characters, showing an honest fallback with exact textarea views still available. No dependency, mutation, document reset or undo history added. LF splitting retains CR characters and exact reassembly; empty/Unicode cases tested.

Local build and 23 combined browser tests passed on 2026-10-03 (includes layer-context local work). Independent diff tests reconstruct LF/CRLF/Unicode/empty input, enforce bounds, verify HTML is display-only and capture Light/Dark. Actual standalone diff pixels and integrated comparison dialog pixels inspected: legible and within viewport. Native IPC/save regression still green under mocks. OS saving/recovery acceptance remains separate.

Not in the previously handed-off Windows installer. No public/live deployment or main merge.
