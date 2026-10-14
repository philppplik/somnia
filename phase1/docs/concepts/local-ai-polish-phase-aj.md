# Ollama polish review, Phase AJ

Existing model-manager UI already lists installed variants, per-layer progress,
cancel Unknown, reviewed delete and fresh retry. AD/AG cover stopped/not-detected,
missing model and explicit connection/setup. Native version read already has a
2-second deadline, inventory 5 seconds; this slice adds no health probe or poller.
Task/studio choices already persist only with Save through non-secret settings.
No studio UI owner files need edits for the remaining bounded fixes.

Pure review/tests focus on two gaps: pull progress must not accept completed > total
as truthful layer state, and studio model preferences should reject whitespace and
cloud aliases consistently with task model preferences. Existing selection values
remain exact tags across persistence, not renamed/auto-selected after download.
Tests cover independent task/studio values and settings round-trip without API keys.
No dependency, provider call, UI control or automatic mutation added.

Roadmap-Delta: full manager/health/per-feature selection packaged acceptance remains
open. Pull cancel still owns the socket only, not proof the shared daemon stopped.
Native timing and real disk/network errors need actual CI/device tests.

Evidence: 24 focused tests and 454 broad Agent/provider tests pass. No prior test
changed. DS, commands/UI inventory and layers pass (1661/5961), existing compiler/
ignored/stale-baseline warnings retained. Unfiltered typecheck reports only inherited
missing generated slides-engine/pkg/somnia_slides.js. No native/version-timing,
full-manager UI, package or WASM execution. Existing saved invalid studio choice
now fails closed on restore/save instead of being silently trimmed or treated local.
