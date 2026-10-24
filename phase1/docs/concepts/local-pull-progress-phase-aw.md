# Phase-aware local model pull progress (AW)

User-visible refinement of existing model manager only, no new transport/dependency.
Current downloading phase with finite valid completed/positive total bytes shows
current-layer byte count and floor percent. Missing/invalid totals show Unknown,
not fake percentage. Verification/install/reconcile/cancel/terminal phases never
show lingering layer bars. A layer's 100% is never installation success; existing
inventory/local verification still owns Complete. No estimated overall ETA/speed.

DS Notice/Button and tokenized native progress. Cancel-requested button disabled,
preventing repeated clicks while waiting for owned transfer status. Daemon/shared
client cancellation remains unknown when unconfirmed. Same-model retry continues
to open existing model/disk/network acknowledgement dialog, never auto-restarts or
promises byte-offset resume. No new model defaults/params or hidden inference.

Three unit tests + 504 Agent/provider tests, two new browser tests and three existing
resilience browser tests pass. Five locale placeholder coverage/light/dark/German
390px no horizontal overflow. Light desktop/dark narrow pixels inspected, byte
bar/text/unknown/verification/cancelling warning and disabled button readable.
DS/commands/UI inventory/layers pass with inherited compiler/ignored/stale caveats.
Unfiltered typecheck only inherited missing generated Slides module. No native/full
app E2E, real transfer/cancel or daemon-resume certification.

Roadmap-Delta: honest phase-aware per-layer progress, repeated-cancel guard; real
native transfer/status/resume proof remains CI work. No dependencies/spend.
