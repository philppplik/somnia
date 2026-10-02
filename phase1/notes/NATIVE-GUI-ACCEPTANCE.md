# Native alpha acceptance checklist

Private unsigned development artifacts only. No public release, merge or production deployment. Linux binary build has passed, but binary compile alone proves none of these interactions.

## Automated Xvfb smoke
Planned Actions job installs WebKit2GTK and Xvfb, builds unsigned deb and AppImage, starts native binary, checks visible Somnia window/process, opens command palette and split view by keyboard, retains PNGs plus app log.

Each PNG must be inspected for real rendered UI, readable controls and absent blank/error window. A running process plus screenshot file is not enough. Do not call file persistence tested from this smoke.

## Real folder and persistence checks
Use a disposable project folder, never the user's only copy.

1. Open index.html plus styles.css; disk content replaces memory fixture. Native folder label appears.
2. Change text in canvas, view exact code patch, undo/redo both views.
3. Insert HTML element and reorder source layer. Save and compare on-disk bytes, not status alone.
4. Make rapid edits through autosave. Confirm newest content persists and old save completion cannot clear new dirty state.
5. Change file externally while clean, verify clean reload. Undo must not resurrect an obsolete snapshot.
6. Change file externally while dirty. Confirm conflict and no silent overwrite. Open comparison, review exact disk/editor/result, confirm save. Change disk again before save and confirm rejection.
7. Simulate denied directory/write permission. Stage/save must stop, visible error and latest content remain unsaved.
8. Close with unsaved files. Verify cancellation preserves working state; recovery route must be explicit.
9. Force-close during unsaved stage. Relaunch same folder. Recovery listed but not automatically restored; explicit restore uses expected revision.
10. Reopen after normal save and verify exact text bytes. Native recovery currently does not restore editor IDs/lock/hide metadata: known gap, not accepted as done.
11. Export ZIP and inspect owned HTML/CSS bytes; no render IDs, scripts unchanged in source, dirty status unchanged.

## Native UI and installer
- Light first-run UI, explicit dark selection, appearance survives restart.
- Minimum 960x600, DPI scaling, readable focus/selection/CodeMirror/palette, no clipped key controls.
- Test native menu dispatch when OS menu is implemented. Current event hook alone is not menu acceptance.
- Install/uninstall deb/AppImage on a supported test OS and re-open. CI no-bundle binary is not installer proof.
- Sandboxed source scripts/events/network loads stay blocked; design frame cannot call privileged filesystem IPC.

## Current limitations to retain in handover
Native journal is text-only. Undo of a created file does not delete retained disk file. Local assets and authored cascade declaration editing remain incomplete. Inline ranges preserve mixed markup; block/embedded richtext selections safely refuse. Final real-OS acceptance is separate from Xvfb smoke.
