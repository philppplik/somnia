# Registered tool boundary pinning

AgentToolRegistry captures execute opt-in boolean at construction and clones definition while pinning level/callback at registration. Caller edits to original options/spec/schema cannot change registry authority, callback or schema hash later. definitions returns detached schemas; provider/consumer edits cannot mutate registered schema/permission identity.

Existing execute registration and default read/propose level filters, disabled list, cancellation and duplicate-name guards remain. A detached schema does not grant execution; host current run permission still applies. Tests cover alias schema/callback/level/options mutation and explicit execute/disabled gates. No new tools/runtime/UI/cloud/dependencies/spending or visual claim.
