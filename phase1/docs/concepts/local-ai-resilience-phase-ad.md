# Local model resilience UX, Phase AD

The existing LocalAIHealth snapshot row now names an explicit Test connection
metadata action and a fixed localized status for untested, daemon running/stopped,
not detected, unreachable, unavailable or reachable with unknown inventory. It
uses the existing parent Refresh only, not a second probe/poller. Status does not
claim inference readiness or model installation. Existing per-model health shows
missing assigned models and retains its explicit metadata retry.

Pull job errors no longer appear as raw native/daemon exception text in the health
error list. Exact known internal classifications map to fixed disk, registry,
integrity or permission messages; anything else gets generic retry guidance. Actions
also avoid storing a raw caught exception as UI error state. Five locales cover
all new status/error/action strings; no pattern-based secret filtering claim.

Existing one-click Review resume/retry opens a fresh dialog for the exact prior
model, resets disk/ack, and does not begin a download. Existing disk selection,
fresh disk/identity checks, acknowledgement and explicit final confirmation remain
required. This is not byte-offset resume or proof that the shared daemon stopped.
No direct download retry was added and no wallet/security/review gate weakened.

Evidence: 26 focused Node tests, 440 broad Agent/provider tests and three browser
tests pass. Injected runtime/job fixture checks stopped/not-detected/unreachable,
Test connection transition without additional pull, missing model, opaque error
not present in DOM, same-model retry review with disabled confirm, five locales.
German desktop/narrow pixels inspected for wrapping and no horizontal overflow.
Unfiltered typecheck still only missing generated slides-engine/pkg/somnia_slides.js.
DS, commands, UI inventory and layers pass (1654/5938), with existing compiler and
ignored/stale-baseline warnings. No native/real daemon/package/full-app or WASM
execution. No new probes, deps, flags, background monitoring or spending.

Roadmap-Delta: packaged Test connection/start/setup and real interrupted transfer
acceptance remain open. Metadata and error guidance are snapshots, not recovered
service guarantees; obtain shared daemon outcome evidence before claiming cancel.
