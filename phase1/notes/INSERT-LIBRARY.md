# Insert blocks and personal source library

Branch: feature/insert-library, based on Foundation8f20a05, independent of layer/diff PR4/5.

Adds Card, Feature list, Hero, FAQ and Contact fields using source-only HTML. Existing drag index protocol remains compatible. No default CSS or form backend invented.

Selected source slices save into somnia.components.v1 localStorage, max40 blocks/100KB each/60-character names. Library is app-profile only, not project data or cloud sync. Saved classes are retained; duplicate IDs within the block or existing document are rejected before transaction. Referenced external CSS/assets are not bundled. Source scripts remain source; sandbox disables execution as before. Insert uses core shared undo; saving library does not change project dirty state. Storage errors report failure with no success claim. Remove confirms, affects library only.

Local build and 24 combined browser tests passed before extra duplicate-ID/storage-error test; both library tests then passed. Light screenshot visually inspected, scrollable panel readable with personal controls in viewport. Core is unchanged. Branch CI must validate independently; native saving/recovery remains unverified.

Settings Components copy updated to reflect actual library rather than stale planned-only claim. Not in previous Windows installer; no public/live/main changes.
