# Stop turns with unreconciled tool work

AgentSession now propagates typed ToolUnreconciledError from tools to its turn error boundary before generic tool failure sanitization or abort override. Previously a generic tool-denied result could be fed back to model, inviting another tool call despite possibly completed work. Now turn stops, fixed nonretryable reconciliation notice reaches host, no raw/private tool output replay and no follow-up model round.

Depends on typed error taxonomy70b787d34. Existing ordinary tool failure handling unchanged. Existing error boundary clears staged project proposals but cannot imply native mutation was undone; notice explicitly says review document/receipts before retry. Tests simulate typed tool refusal with/without simultaneous cancel and assert one provider round, no tool result replay/private content, error state/nonretryable notice. No new effect/UI/cloud/dependency/spending.
