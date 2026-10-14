# Tool boundary integration proof

Verified pending patches compose on fetched5234d47fe: registration pin2ded1fab8, argument pinaf9b3e9b0, late outputace8691ef, typed taxonomy70b787d34, session stop497019839. Resolve taxonomy conflict by using exactly one post-await spec/grant check throwing ToolUnreconciledError, not duplicate generic+typed guards. No other semantic merge change.

58 tests pass across existing session/error/native prep and all boundary tests. Combined real Sheets prep test edits offered schema and caller args, revokes tool during async snapshot, then verifies schema hash stable, original6 staged, late output typed nonretryable/unreconciled. Staging completed is not silently undone; host must reconcile/revoke, not automatically retry. This honest distinction is required before future model/tool integration.

This test-only patch assumes all five prerequisites integrated. Local cherry-picks were for proof, not re-shipped duplicates. No new effects/model/runtime/UI/cloud/dependencies/spending or native receipt/save claim.
