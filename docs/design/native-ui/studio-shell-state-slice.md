# P6 shell state slice

Base fetched int/beta5 fef77dbc. Photos/Interface starter layouts share StudioEmptyState with their existing
localized copy, labels and hooks. Photos exposes Open only: its development engine has no supported blank
photo creation flow. Interface retains Create blank document. Animation/3D keep their existing shared starter.
Primary starter no longer forces white text over a custom accent; DS action ink remains the paired role.

StudioStatus is an inline, atomic status/error primitive (semantic text, no auto-dismiss toast).
Photos note/status, Interface recovery/notice, Animation recovery and 3D loading/error use it.
Error urgency is explicit; callers still own safe translated copy, retry, busy state and actual operations.
No new network, file write, session, undo, autosave or consent behavior. Not a universal notification manager.

3D RecentList now renders shared StudioRecentList, retaining classes, IDs, timestamps, metadata,
local storage and open/clear handlers. Bare NativeButton preserves geometry rather than adding generic button paint.
No recent UI fabricated for Photos/Interface/Animation, whose storage/restore contracts differ. Animation is
recovery restore, Interface snapshot import/recovery, Photos opens media and exports copies, 3D stores local scenes.
A common persistence service or Save semantics would require domain-owner review, not a styling refactor.

Tests: existing 12 starter SSR tests plus three status/capability/recent tests, isolated open failure and keyboard
recent test/screenshots. Full app/native engine Save/Open/Recent proof stays CI-only, existing behavior gates remain.
Snapshots below are isolated shared-state components, not full studio app evidence or baseline updates.
Settings untouched. Follow-up: evaluate full app starter geometry, light/dark action fill cascade and long-localized
states, then migrate remaining busy/export/notice consumers in separately reviewed slices.
