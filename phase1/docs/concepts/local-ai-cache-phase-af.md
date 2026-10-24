# Shared explicit local readiness snapshot, Phase AF

One in-memory record holds a cloned last explicit metadata result, endpoint and
source checkedAt. Only existing user-triggered Local tab Refresh/Test connection
and per-model Inspect/retry write it. Existing automatic mount refresh and mutation
reconciliation do not write cache. No storage, new probe, inference or source polling.
Explicit failed reads clear cached evidence rather than retaining stale success.

Chip reads the default endpoint record and exact effective model; fit/advice reads
only its runtime endpoint record. States distinguish inventory present, missing,
unknown, unreachable, untested and expired. Timestamp updates locally once per minute
and expires after two minutes using render timers only, no source I/O. Cache evidence
is daemon/inventory metadata, not verified locality/capability/inference. It must not
advertise model Ready. RAM fit retains independent hardware timestamp and expiry;
this cache never fabricates fresh RAM evidence. Five locales label metadata checked
N min ago and explain these limits.

Evidence: two cache unit tests and 444 broad Agent/provider tests pass. Three browser
fixtures use real LocalModelsSettings/LocalModelHealth/chip: automatic mount not
cached, explicit connection/health action cached, exact missing model, clock-driven
expiry with no extra runtime reads, German narrow pixels inspected. No native/full
app/package/WASM execution. Unfiltered typecheck only inherited missing generated
slides-engine/pkg/somnia_slides.js. DS/commands/UI inventory/layers pass at 1658/5956,
with existing compiler and ignored/stale-baseline warnings.

Roadmap-Delta: native/cross-window invalidation and endpoint-specific shared cache
would need separate evidence/scope. Current cache is one endpoint record, not a
cross-process freshness guarantee. Each actual run retains its fresh safety checks.
