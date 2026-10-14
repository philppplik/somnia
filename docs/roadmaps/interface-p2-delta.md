# Interface P2 delta: local resources, grid, frame export and handoff

Base: P1 `acf520ff`. Bounded next editor increment, not full token interoperability or production handoff parity.

## Implemented

- Document-owned local color/number variables, typed alias chains and fill/gap bindings. Resolvers report missing/type/cycle/depth errors and retain the authored fallback. Imported variable names never become app CSS, expressions or remote requests.
- Reusable text styles: generic sans/serif/monospace, size, line height and weight. Text nodes bind by stable style ID; missing styles fall back with a diagnostic. Hug uses style-scaled approximate metrics, not a measured font engine.
- Variables/styles editor on the left, per-node binding choices on the right. Resource edits are validated transactions and propagate through live document bindings. Instance binding/structural changes require detach; root readiness/annotation stays local to its instance.
- Basic equal-column grid: 1-24 columns, row-major placement, gap/padding/alignment, per-row intrinsic height and Fill width. Grid semantics persist separately from computed geometry; Hug height sums row maxima. No arbitrary tracks/spans or responsive breakpoint system.
- Selected-frame SVG from a frozen validated revision: resolved values/bounds, shape/text rendering, frame clipping, escaped text, explicit lines, generic font references only. No scripts, foreignObject, remote assets or user-supplied SVG commands.
- PNG renders the same generated SVG through a local image/canvas path. Limit 8192px per axis and 16 MP, bounded render wait, object-URL cleanup and visible failure. Export downloads never clear document dirty or change undo.
- Export review shows frozen revision/dimensions and loss notes before SVG/PNG download. Text/font substitution and wrapping differences are explicit warnings, not a pixel-exact promise.
- Prototype-free read-only handoff snapshot: document/revision/frame identity, computed bounds, resolved fill/text/style, semantic layout/sizing, variable bindings, component values, hidden state, annotations and manual readiness. UI freezes and displays/downloads JSON. Readiness is explicitly not proof of accessibility or production completeness. New selection clears old review; source edits do not silently rewrite a frozen review.
- Five-locale resource/grid/output labels, validation and unit/render fixtures, CI-only acceptance for variables/grid/export/handoff.

## Verification

- 223 focused Interface/studio/routing/shell/render tests passed. Coverage includes alias/fallback/type/cycle diagnostics, invalid payload rejection, text styles/Hug, equal-grid placement/Hug, escaping/clipping/determinism, bounded export, read-only handoff, source/undo invariance and all earlier gates.
- `check:ui-commands` passes (299 commands/five locales); `check:commands` passes; diff whitespace check passes. Full typecheck reports only existing missing generated `slides-engine/pkg/somnia_slides.js`, no Interface error. No stub or engine build added.
- Isolated actual pixels inspected at 960x600 dark/German, 1280x720 light, 1440x900 dark and 1920x1080 light/German, plus 125% German scale. Scrolled resources and export/handoff controls are reachable. Additional grid screenshot and actual generated 500x192 PNG inspected: text, columns, gap, padding and token-bound fill render correctly. Earlier 360x152 stacked card export inspected too.
- These are component/export pixels, not full-app native/E2E acceptance. Application suite extended but deliberately not run locally. Full shell/Agent, native writes and production CI remain gates.

## Remaining limits

No DTCG import/export or standard-compliance claim, token modes, remote libraries/fonts, token typography composites, color alpha/effects, arbitrary grid tracks/spans, text shaping/font measurement, assets/images, prototype/player, code generation, SDK or collaboration. Generic text wrapping may differ between DOM preview and SVG; Hug metrics remain approximate with diagnostics. PNG exports the bounded supported SVG subset only, not arbitrary imported media. Handoff JSON is a reviewed design snapshot, not runnable production output or accessibility certification.

No new third-party dependency, FigCraft code, cargo/WASM, format association, network/AI permission, global.css/tokens.css change, push/release or spending.
