# Shared local model entry point, Phase AE

Existing AgentPanel already shows provider/model, local settings link and narrow
Interface/Animation/3D assistant. There was no reusable studio status entry point.
LocalModelChip fills that gap and is used in AgentPanel, with optional studioId and
task props for other studios. It reuses settingsRuntime/appStore only and existing
task > studio > global precedence. No inference, metadata, download or system probe
on render or settings click. Button opens AI/local, never switches provider/model.

States: settings loading, AI busy/review pending, active choice not local, missing
model, or configured/readiness not checked. There is no shared verified daemon/model
readiness snapshot available from saved settings, so no fabricated Ready badge.
Configuration is not installation or locality evidence. Each explicit run still
performs existing fresh checks. Tooltip and visible unverified label make this
boundary clear. Five locales, compact wrapped DS button, no deps or flags.

Evidence: two pure precedence/status/locale tests and 442 broad Agent/provider tests
pass. Three browser tests use the real component and existing settings init: multiple
studio/task/global chips, loading/cloud/missing/busy, one-click navigation, zero
fetch calls on render/click, five locales. German desktop/narrow pixels inspected.
No full-studio/native/package E2E. Unfiltered typecheck has only inherited missing
generated slides-engine/pkg/somnia_slides.js; DS/command/UI inventory checks pass.
Layers 1656/5948 passes with existing compiler and ignored/stale-baseline warnings.

Roadmap-Delta: place the shared chip in additional studio-owned toolbars after their
layout review; a future shared source-grounded readiness cache may supply explicit
checked status. Do not start polling or advertise Ready from configuration alone.
