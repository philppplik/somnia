# Interface P38 delta — design-token JSON import (picked gap)

Pick: design-token import/export JSON round-trip. Component library publish/sync already has usage tracking, detach flows and library search; prototype transitions shipped in P18/P35 (including smart-animate). Token export (CSS + JSON) existed, but there was no import — the round-trip was open.

Built:

1. **Token JSON import** (`importInterfaceTokens`): accepts the `somnia-interface-tokens` v1 format the studio exports. Merges variables and text styles by type+name (add/update/skip), remaps alias references from file ids to local ids (unresolvable aliases drop with a warning), validates every entry against the same rules as document validation — invalid entries skip with warnings instead of aborting the import — and fails closed on wrong kind, version, size (256 KB) or item count (200). One transaction covers the whole import, so one undo reverts it.
2. **Output panel UI**: "Import tokens (JSON)" button with hidden file input and a localized result status (added/updated/skipped/warnings). The raw ready-checkbox migrated to the DS Checkbox primitive to stay inside the raw-input budget.

Tests: 367 focused tests green (+6: 5 lib tests covering round-trip, idempotent re-import, update-in-place with undo, one-undo revert, invalid-entry skipping and fail-closed rejection; 1 EN/DE render test). Gates: check:ds, check:ui-commands, check:commands, check:layers all pass; tsc clean apart from known upstream studio3d/slides/stage noise. CI-only spec `Interface P38 token JSON import merges with one undo` added; acceptance paragraph P38 added. Light/dark screenshots inspected (EN light + DE dark: import button and localized result status visible).
