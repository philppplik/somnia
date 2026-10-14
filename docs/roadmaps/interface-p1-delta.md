# Interface P1 delta: layout, constraints and local components

Base: Interface P0 `0564f8a7`. This implements the assigned next editor increment, combining layout and basic local UI-system features from concept sections 5-6. It does not claim every item in the concept's numbered Phase 1/2 gates.

## Implemented

- Somnia-owned TypeScript layout schema and deterministic computed-bounds adapter. Row/column stacking, wrap, gap, four padding edges, start/center/end/stretch alignment and Fixed/Hug/Fill sizing with explicit min/max bounds. Absolute children and hidden layers do not consume flow space.
- Layout semantics persist independently of computed bounds. Hug-parent/Fill-child resolves to intrinsic size with a diagnostic; wrapped fixed-main/Hug-cross containers measure wrapped lines. Hug on the wrapping main axis uses unwrapped intrinsic size with a diagnostic. Text Hug uses approximate fixed metrics with a diagnostic, not claimed font fidelity.
- Free-layout/absolute-child constraints: start/end/center/stretch/scale on both axes with a captured parent-size baseline. Source x/y/width/height remain semantic inputs, not a cache rewrite.
- Local component masters and named variants, instance creation, source navigation, switch/reset/detach controls, stable semantic slot IDs and allowlisted text/name/color/hidden/size overrides.
- Master changes plus bounded instance propagation are one transaction/undo entry. Compatible overrides survive variant switch. Removed slots preserve orphan override records and visible diagnostics rather than targeting another layer. Instances retain their stable descendant IDs where slots match.
- Nested component dependencies propagate in dependency order; cycle/depth/count checks fail closed. Instance structure/layout edits require explicit detach. Adding new master layers assigns fresh slots automatically.
- Existing Layers panel includes local component/variant creation buttons. Properties has layout/constraints/component controls. Canvas renders the computed scene, blocks misleading free dragging inside stacks/instances, and shows a compact expandable diagnostic list. Numeric and reorder alternatives remain available.
- Optional P1 scene fields validate on load and remain in snapshot/recovery. UI copy extends all five locales. No new network/AI/SDK/export/format capability.

## Verification

- Focused Interface, studio, routing, shell and server-render component tests pass, including deterministic 1k-layer layout, wrap/Fill/Hug fixtures, constraints, master propagation, nested references, compatible variant overrides, orphan warnings, rollback and round trip. 212 tests passed in the final focused run.
- `check:ui-commands` stays green (299 commands/five locales); `check:commands` green. Typecheck reports only the pre-existing missing generated `slides-engine/pkg/somnia_slides.js`; no new Interface errors. No stub/engine build added.
- Actual isolated pixels inspected at 960x600 dark/German, 1280x720 light, 1440x900 dark and 1920x1080 light/German. Additional bottom-of-properties screenshot proves padding/sizing/component controls are reachable; German 125% scale fixture remains scrollable. The scene shows a stacked Hug card, dark variant and linked instance. These are component fixtures, not app-shell E2E evidence.
- CI-only app acceptance suite extended for auto layout and create/switch/detach component variants. Not run locally. No Cargo/WASM, app E2E, dependency adoption or paid action.

## Remaining gates/limits

Full-app CI, native/browser file-write routes and visual checks with Agent open remain required before a release. At narrow widths, the canvas scrolls; shared responsive overlay policy is still owned by the shell. There is no measured text/font engine, grid, multi-axis typed variant properties, arbitrary instance structural override, library import/update workflow, token-mode system, player, handoff/code export or collaboration.

Named variants are local snapshots with stable corresponding slots, not a Figma-parity variant-axis engine. Hug text metrics are approximate and explicitly diagnosed. 1k fixture correctness is not a performance benchmark. Validation caps stay 2k materialized nodes, 100 components, 50 variants per component and 32 reference depth. P1 does not finish the FigCraft/Taffy extraction spike. No third-party import or new dependency, no format hijack, no changes to global.css/tokens.css, no push/release/spending.
