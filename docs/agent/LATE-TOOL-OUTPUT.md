# Late tool output after revocation

Registry revalidates exact registered spec identity and current grants before returning async callback output. Host unregister/replacement, disabled-tool or level revocation suppresses late private output. Signal cancellation check remains. Callback is invoked once; no implicit retry or new execution.

This is output suppression, not a claim that already-completed callback work was cancelled or undone. Error explicitly requires reconciliation before retry, particularly for staged proposals or opt-in execute tools. Host still owns native cancellation/receipt/revoke behavior. Does not broaden authority or replace per-port current target/permission checks.

Tests pause callback then unregister/replace/revoke disabled/levels, require suppression and call count1. Unchanged grant returns original output. Existing prep tests preserved. No visual UI changed, new dependencies/cloud/spending or save claim.
