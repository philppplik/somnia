# Atomic folder switching

Follow-up branch planned: `fix/native-folder-switch`, based on the current `phase1-foundation`, not the appearance branch.

## Fault

The adapter previously closed the existing project before the native folder picker returned. Cancel or an unreadable candidate left the original document model disconnected. Source inspection establishes this path; no user data-loss incident is claimed.

## Change

Keep current native project alive through picker cancellation, candidate file listing/read, and EditorProject validation. Close old project only after the candidate is ready. On candidate failure, release only that candidate project with recovery retained. Do not change the current model or save commands.

## Validation

2026-10-02: build passed. Three desktop-adapter browser tests passed, including new cancellation/read-error test; all 20 browser tests passed with this patch plus settings. Native IPC is mocked in this test, so this is not native GUI acceptance. Core files are unchanged. Local files under this follow-up folder are pending isolated branch commit; they are not in the settings source import or previously shared installer.

Deferred gaps: opening the same already-locked folder, recovery command lifetime, metadata recovery, real OS persistence/close behavior.
