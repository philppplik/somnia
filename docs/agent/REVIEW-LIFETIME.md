# Host-reviewed proposal lifetime

Animation, Documents and Slides receipt ports now retain acceptance capability only after host staging returns successfully and cancellation is checked. Review target/value metadata is copied before callback. A thrown stage or callback abort cannot leave a rejected preview privately eligible for later acceptance. Acceptance during the stage callback is not permitted; staging is preparation, not approval.

Host-only revokeReviewed(originalProposal) removes a dismissed/rejected preview. It returns true once, false for unknown/already consumed proposal. Revoke has no native mutation effect and never undoes an applied action. Keep native undo on its exact receipt and permission gate. UI dismissal wiring is explicit future host work; no global UI/model execution enabled by this slice.

Tests prove abandoned/failed/cancelled preview cannot accept and original native content remains unchanged. Existing exact review/native receipt/unknown/undo tests are preserved. Animation detached-vector receipt hardening prerequisite5731d08ec is separate and must land first. No dependencies/cloud/spending or broader effects.
