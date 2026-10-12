# M3: shell frame and per-studio panel layout

Base: fc8bac59fa3ac242dd13153f9140369e6a3fa023 (int/alpha6).

## Implementation

- ShellFrame extracts the existing five-column editor grid without new DOM wrappers or CSS.
- Code declares its panel definitions in lib/shell/codePanels.ts. Its single-panel path retains the existing host chrome and DOM. Two or more open panels use a collapsible, closeable, reorderable stack.
- hosts.tsx resolves components through an explicit allowlist. Future studio packages register their panel hosts, including lazy components, with registerPanelHost.
- shellLayoutStore persists versioned layouts under somnia.shellLayout.v1: widths, visibility, panel order, active panel, collapsed panels and rail overrides. Invalid widths/panel IDs are sanitized. Storage errors degrade to session-only state.
- appStore synchronously bridges legacy panel commands and resizing, saves outgoing layouts, and restores incoming layouts. Existing document/history ownership is unchanged.
- Non-migrated studios retain their legacy sidebar hosts and shared layout path. Migrated studios are identified by actual PanelDef declarations, not by a menu-only shellV2 manifest.
- IconRail accepts declarative panel/action items and arbitrary panel IDs, with the existing keyboard behavior. Global rail controls remain unchanged. M3b can build on studioRail, shellLayoutStore and existing railResolver without changing Code's manifest/menu ownership.

## Verification

All scripts use repository-local tsx.

- Full test:core file scope: 329 unique files, run in six disjoint groups because the sandbox command timeout is shorter than the full suite. 2857 tests: 2801 pass, 0 fail, 30 skip, 26 todo. No source/test skips added by M3.
- test:vibespace: 133 pass, 0 fail.
- Final shell/appStore/studio targeted rerun: 41 pass, 0 fail.
- Browser: four existing Code shell golden tests pass at their existing tolerance, plus two light/dark panel stack, collapsed state, reordered panels, studio switch isolation and reload tests.
- check:commands: up to date. check:ui-commands: 102 commands in sync.
- check:layers: no new violations; 90 known violations ignored. Existing TypeScript 7 transpiler warning remains.
- tsc --noEmit: only the known missing slides-engine/pkg/somnia_slides.js module.
- test:goldens: 20 pass, 0 fail, 2 existing WASM skips (bridges not built locally). No baseline files changed.
- Compared same-browser light/dark Code screenshots directly against the unmodified fc8bac5 worktree. Layout and geometry unchanged. Raw AA jitter: 127 light / 291 dark pixels, maximum channel difference 7 / 16, zero pixels with channel difference above 20. The authoritative zero-pixel gate belongs to the CI runner, which must run after integration. Local checked-in goldens are not claimed to pass at zero raw difference.
- Actual light/dark screenshots visually inspected: baseline rail positions, bento cards, panel widths, content and status bar unchanged; stack labels/order/closed panel are visible and readable.

## Caveats

No Windows/macOS native-window verification, no full WASM bridge build, and no release/push. English stack labels match the current Code panel labels; later studio migrations can supply translated PanelDef titles. A single-panel compatibility path intentionally adds no close/collapse header; it collapses through the active rail button. Multi-panel stacks expose individual headers.
