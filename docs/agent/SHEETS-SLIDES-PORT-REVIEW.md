# Sheets/Slides prep review

Reviewed fetched int/beta5 tip7d5b250f4. Execute remains unavailable. Sheets engine/session/protocol has no reviewed native receipt path; Slides copy/open/render/history sequencing still lacks logical origin receipt/undo. No speculative acceptance bridge was added.

Hardening: Sheets now requires explicit inspect/propose host permission callbacks, matching other prep ports rather than relying only on a permission-gated snapshot description. Proposed cell input rejects unpaired UTF-16 surrogate, avoiding replacement-byte text corruption. Sheets and Slides now check cancellation immediately after propose permission callbacks and before stage; a host callback that aborts cannot leave a staged preview behind while reporting cancellation. Exact targets still rechecked after permissions.

Tests add host deny/cancel/epoch-change and surrogate refusal for Sheets, permission-callback cancel for Slides. Existing tests/fixtures retained, synthetic permissions updated only to satisfy stricter contract. Sixteen focused tests pass, two Light/Dark browser tests pass. Actual four screenshots inspected: readable typed preview, no Apply button, explicit execute-unavailable/nothing-applied-or-saved. No dependencies/cloud/runtime execution/UI promotion; native model/render/save proof remains unknown.
