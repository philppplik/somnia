# Native partial-output gate repair

Source-reviewed against beta5 8aefc8ab. Native execution/compilation is CI-only and has NOT been verified locally. No cargo/WASM was invoked. Existing default-off experimental transport stays off.

## Root causes

The Goose inference select polls the empty bounded delta receiver before polling the model future. That same future poll can send a delta into the channel and immediately return Err (or a final reply). The ready result branch exited without re-polling/draining the receiver. Thus PartialFailure's `Unfinished output` was accepted by send but never emitted as TextDelta/persisted. On success this could also bypass comparison against queued provisional output. This is an implementation race, not a reason to weaken the partial snapshot assertion.

Close and drain queued frames when the model future resolves, using the same frame/chunk/aggregate limits and offsets, before interpreting success/error. No new message/tool/authority is produced from partial text. A successful final reply must match all emitted provisional bytes and still cannot carry a tool after provisional text. Error emits queued partial before Failed. Detached sender clones cannot extend a completed turn once receiver closes.

Separately Runtime::stop only signals cancellation after revoking effects. The event consumer persists Stopped later. Two core tests read snapshots or call feedback retry immediately after acknowledgement. They raced that persistence. Tests now wait for exact durable Stopped with a bounded deadline, then retain all original role/text/no-write/no-apply/fresh-successor/idempotency assertions. Runtime stop behavior and eligibility gates are unchanged. Timeout fails; Failed/Done are not accepted instead of Stopped.

## CI-only verification required

Run existing native engine and core suites through their existing CI jobs. In particular retain the three reported failures and two new engine regression tests. New regressions exercise a send-and-return in one poll for error and success/mismatch, check delta-before-terminal/final and no final/tool event on failure. This patch is source-inspected only until CI reports actual results. No claim of green native acceptance is made.
