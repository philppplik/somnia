# Sound proposal review mount (D2)

Status: implementation slice, headless-tested. No new dependency.

## What changed

`NativeProposalReview` mounts the existing Sound-owned `SoundProposalReview` for `sound-settings-v1` proposals instead of the plain text diff list: the localized settings diff plus the audible preview button (render of the proposed settings through the existing preview path, never touching the session). Accept/Reject, receipts, review history and undo stay entirely with the shared host; the Sound component only describes changes and renders the audition. This is the previously "prepared, not mounted" rest-plan item 1 of the Sound package.

The mount is the minimal shared-host change (one conditional render plus an import in `components/agent/NativeProposalReview.tsx`); the review body, preview logic and its tests remain Sound-owned.

## Honest limits

- The preview button needs the clip still open and decoded; without it the action fails with a clear error, and the diff remains readable regardless.
- The preview is a fresh render of the proposed settings; it is not cached against the session render.
- Other adapters (photo, deck, code) are unchanged.
