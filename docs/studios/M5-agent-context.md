# M5: studio context adapter

Base: `fc8bac5` (`int/alpha6`). This package does not migrate shell manifests or add the M5b command approval gateway.

## Contract

`AgentStudioContext` identifies the active studio, its host-selected document, a bounded selection summary, view mode, declared capabilities and context providers. `agentV2` overrides the adapter defaults. Code and Photos opt in for M5; unmigrated studios retain their existing panel. Legacy Code media/raster/vector/PDF views retain their existing native tools instead of losing access through a Code allowlist.

The panel is not keyed or remounted on a studio switch. A host-owned header chip changes and each run gets an ephemeral studio note. Completed user/assistant exchanges survive a same-provider studio change. Old tool results and document context packages are not replayed into the new document; project replacement, provider change and New chat clear the applicable history.

Tool declarations are intersected with the actual scoped native registry after document inspection and disclosure approval. The same allowlist guards execution, not only provider advertisement. Empty studios have no document tools. File access, cloud disclosure, identity/revision checks, proposal review and guarded undo are unchanged. No generic file tools or execute-command tool are introduced.

Quick actions resolve command IDs to the registry/scoped command title and availability. They recheck availability on click and use the existing command dispatcher. These are explicit user clicks, not model-requested actions. Missing commands are omitted. Existing prompt suggestion chips still only fill the input. M5b can consume the typed context and existing command metadata to add its separate approval path.

## Verification

- Full `test:core` first leg run in partitions with repository-local `tsx`: 2803 pass, 0 fail, 30 existing skips, 26 existing todos. The incremental differential suite (22 tests) was split into five seed groups and an extra pair to fit the execution time limit. Includes six new M5 adapter tests.
- `test:vibespace`: 133 pass, 0 fail.
- `check:commands`, `check:ui-commands`: pass. 102 UI commands remain in sync.
- `check:layers`: pass with unchanged 90 known violations. Existing TypeScript 7 transpiler warning remains.
- `tsc --noEmit`: only the known missing `slides-engine/pkg/somnia_slides.js` import.
- Playwright studio-switch tests: light and dark pass. Provider payload checks confirm the native Code set, no tools in empty Photos, ephemeral Photos note and conversation replay. Photos native registry/session test confirms the exact two Photo tools, no pixel disclosure and rejection of Code tools.
- Existing `studio-code-*` shell snapshots: 4/4 pass, unchanged.
- Strict `current-code-*` snapshots at zero tolerance: 4/4 fail on both M5 and untouched `fc8bac5`. The local strict comparison does not pass; parent clarified that the CI-runner baseline is authoritative and the integrator will run that gate. No snapshots were regenerated. Visual diff includes header/pill/icon/status differences outside the panel. CI verification is not claimed by this package.
- Raster goldens: 20 pass, 2 existing skips because WASM is not built. No rebaseline.
- Real panel screenshots inspected in light/dark for Code/Photos: chip readable, header buttons unobstructed, conversation retained, consent controls and input intact.

A browser test opening an actual photo was attempted but could not run because the checkout lacks `photos-engine/pkg/somnia_photos_spike.js`. No engine stub was committed. Actual engine decoding/rendering and real Windows/macOS behavior are not verified here.

Run M5 UI checks with `npx playwright test --config playwright.m5.config.ts`; set `SOMNIA_CHROME` only when a system Chrome executable is needed. Mocked provider requests stay local to tests.
