# Phase 1 continuation

Keep Phase 1 acceptance open. The green Linux baseline CI proves Rust tests, compile and unsigned Tauri binary build, not an interactive desktop session or packaged installer.

## Newly implemented local follow-up
- Light first-run default and persistent appearance choice; explicit Light/Dark commands.
- HTML element library, click insertion and actual drag/drop to canvas source container.
- Sibling layer reorder with shared undo, stable source IDs.
- Exact save guard: if journaling newer bytes fails, an older accepted snapshot must not be explicitly saved as the latest edit.
- `.htm` and `.html` design routing consistent.

These changes came after editor-delta import run 36994852043 was created. They need their own source sync after that run lands and read-only CI is restored.

## Still required
- Real desktop open/save/autosave/compare/recovery and crash/restart session.
- Installer artifact and supported OS GUI pixel check. No installer currently emitted by no-bundle CI.
- Native journal currently text only, not editor identities/lock/hide state.
- Actual OS menu, accurate close choices and native window theme.
- Cascade-aware authored CSS declaration editing and local media support.
- Broader richtext selection, layer drag reorder and visual drop indicators remain partial.

## Next roadmap phase after acceptance
Framework support and polish: Bootstrap/Tailwind detection and editing, Grid/Flex controls, assets, typography, search/code intelligence. Do not start cloud, billing, Oneiroi or public rollout as an inferred side effect.
