# Contribution and verification

[Overview](README.md) / Contribution and verification

## 1. Change the system, not a screenshot

For a new surface:

1. Identify the owner: shell primitive, document editor, reusable authoring content, collaboration or Agent.
2. Reuse semantic tokens and primitives. Add a scoped token only for a distinct role.
3. Establish document/selection/service facts before enabling actions.
4. Route mutations through the active document's transaction/history/save owner.
5. Localize labels, preserve focus/keyboard behavior and explicit copy routes.
6. Verify interaction and actual pixels. Update this guide when the contract changes.

A documentation-only change should not alter app source, lockfiles or release metadata. Integrate through a feature branch and review; do not roll documentation into a release claim.

## 2. Evidence levels

| Evidence | What it proves | What it does not prove |
| --- | --- | --- |
| Source inspection | Values, predicates, control flow at the pinned commit | Native rendering or successful persistence |
| Unit test | Bounded state/algorithm behavior | Full editor lifecycle or visual hierarchy |
| Browser interaction test | DOM behavior in tested scenario | OS dialogs/compositor, every format |
| Computed-style assertion | Effective CSS property | Perceived readability or complete layout |
| Screenshot, visually inspected | Visible state at one size/theme | All interactions or export fidelity |
| Native disposable-folder test | Specific native file flow | Every OS and every failure |
| Independent output inspection | Particular exported artifact | Unexamined content or lossless universal round-trip |

## 3. Existing test map

These files exist in the implementation baseline. Their presence is not a claim that this documentation task ran the entire suite.

| Contract | Tests to inspect/run |
| --- | --- |
| Look clamping, accent and density | `src/lib/look.test.ts`, `lookStorage.test.ts`, `tests/look.spec.ts` |
| UI preferences | `src/lib/uiPrefs.test.ts`; `tests/v9-ui.spec.ts` |
| Theme/glass | `tests/appearance-surfaces.spec.ts`, `window-background.spec.ts`, `glass-v2.spec.ts` |
| Card radius | `tests/panel-radius.spec.ts` |
| Focusable rail | `tests/rail-keys.spec.ts` |
| Chrome/document selection | `tests/ui-selection.spec.ts` |
| Commands/shortcuts | `src/lib/commands.test.ts`, `tests/shortcuts.spec.ts`, `help-shortcuts.spec.ts` |
| Context menus | `tests/context-menu.spec.ts`, `canvas-context-menu.spec.ts`, `code-context-menu.spec.ts` |
| Component browsing | `tests/component-browse.spec.ts`, `component-library.spec.ts`, `component-props.spec.ts`, `components-panel-screens.spec.ts` |
| Overlay contrast | `src/lib/overlayTokens.test.ts` |
| Remote input sanitization | `src/lib/collab/awarenessSafe.test.ts` |
| Vector token design | `src/lib/vectorToolsDesign.test.ts` |

Run from `phase1/` after installing dependencies and the required PhotoCraft bridge according to `craft/README.md`. `npm run dev`/build checks for the real generated JS/WASM. Do not bypass that check and report a fake native-engine build.

This documentation adds a dependency-free reference check:

```sh
node scripts/design-system-reference.mjs --check
```

It verifies that the snapshot JSON and theme tables still match foundation CSS and that relative file links in the new guide resolve. Regenerate after an intentional foundation change:

```sh
node scripts/design-system-reference.mjs --write
node scripts/design-system-reference.mjs --check
```

The generator is a deliberately bounded extractor for the current flat token declarations. It is not a general CSS parser, runtime cascade resolver or contrast verifier. Named-theme tables include foundation overrides only; high contrast is listed separately; inline preferences are described in prose.

## 4. Visual review matrix

At minimum, inspect these states using the same document fixture:

- Light and dark default shell, open/collapsed side cards, Agent open.
- Named palettes and high contrast, custom very light/dark accent.
- Components default/search, keyboard focus, variant actions and long labels.
- Selected/locked HTML object; overlay focus and handles against light/dark content.
- Source/split/design, vertical/horizontal and swapped split.
- Markdown, SVG, raster and PDF in alternating tab order.
- Settings at normal and increased UI font/zoom, reduced motion/transparency.
- Busy/error/dirty/close-cancel state, not only an ideal clean document.

Inspect actual screenshots. A passing `toHaveCSS` and an image file on disk do not establish readable spacing. Glass simulation in a browser is labeled simulation; native compositor success requires desktop evidence.

## 5. Known baseline gaps

These findings are from source inspection, not newly filed bugs or implemented fixes.

| Gap | Source evidence | Follow-up validation |
| --- | --- | --- |
| Custom accent does not update fill | `applyLook` vs Button primary/active tab styles | Check consistent filled action contrast and palette behavior |
| Generic popup radius differs from large-popup direction | Layered `.dialog-popup` rules in global/bento; specific dialog overrides | Compare actual generic palette, Settings and full dialog variants |
| Distributed mode/routing predicates | App + Canvas + Inspector + StatusBar | Alternate formats; verify rail and save/undo owner |
| Media dirty state distinct from app storage indicator | FileTabs editor queries vs StatusBar application state | Edited raster/PDF status and close/save tests |
| Custom menus/tablist lack complete common keyboard pattern | Canvas/LayerContextMenu and FileTabs handlers | Arrow focus, keyboard opening, focus return |
| Components `canWrite` is not a full permission gate | ComponentsPanel `coreConnected` predicate | Check collaboration permissions through actual mutation path |
| Hardcoded colors/motion remain | Status dots, math styles, drag ghost, toolbar constants | Token inventory/contrast audit before normalization |
| Incomplete localization evidence | Hardcoded rail labels/PDF command titles among translated surfaces | Catalogue and screen-reader string audit |
| No complete accessibility certification | Partial focused tests and algorithm checks | Full state/contrast/keyboard review |
| S0/S1 integration not in pinned baseline | Integrated after this SHA (fe58afd on somnia-agent); this audit was not repeated against it | Re-audit the pinned findings against the Studio shell; see [Studio direction](studio-direction.md) |

Do not quietly fix these while writing docs. Runtime changes belong in their own reviewed branch with behavior tests.

## 6. Maintenance rule

When changing tokens, primitive APIs, shortcut scope, format routing, dirty/save ownership or presence policy, update the relevant page and baseline/evidence note together. Link actual source and tests. If a requirement is not implemented, keep its status visible.

Keep canonical format documents rather than copy their full specs here. Remove a gap only with integrated evidence. Performance measurements and screenshots must name their scenario; neither is a universal promise.

## 7. Documentation validation for this change

Executed on 2026-10-09 against the pinned source snapshot:

- Foundation reference generation/check: 10 declaration blocks, 32 unique token names and eight palette tables; guide file links resolve.
- Focused source tests: 31 passed, zero failed/skipped, covering look/look storage, UI preferences, overlay tokens, vector-design reference, commands and awareness sanitization.
- Markdown rendered with the app's installed MarkdownIt in local headless Chrome. Eight pages had no body-level horizontal overflow at a 1200 x 950 viewport. Overview, token geometry, component contracts and context/selection tables were visually inspected for readable hierarchy, table alignment and code formatting.
- No runtime application build, full browser suite or native compositor/file-persistence test was performed for this documentation-only change. The local generated PhotoCraft JS/WASM was absent; no fake engine output was substituted.
- The preview used GitHub-like Markdown styling, not GitHub's live renderer. Screenshots are review evidence, not a native Somnia screenshot or an exact GitHub pixel guarantee.

### Additional implementation sources

Use these with the cross-cutting [source map](README.md#source-map):

- [Button](../../../phase1/src/components/ui/button.tsx), [Dialog](../../../phase1/src/components/ui/dialog.tsx), [Tabs](../../../phase1/src/components/ui/tabs.tsx), [Badge](../../../phase1/src/components/ui/badge.tsx), [Separator](../../../phase1/src/components/ui/separator.tsx), [class merging](../../../phase1/src/lib/cn.ts).
- [Rail](../../../phase1/src/components/IconRail.tsx), [FileTabs](../../../phase1/src/components/FileTabs.tsx), [Inspector](../../../phase1/src/components/Inspector.tsx), [StatusBar](../../../phase1/src/components/StatusBar.tsx), [palette](../../../phase1/src/components/CommandPalette.tsx), [resize](../../../phase1/src/components/ResizeHandle.tsx).
- [Settings](../../../phase1/src/components/Settings.tsx), [appearance](../../../phase1/src/lib/appearance.ts), [glass calculation](../../../phase1/src/lib/glass.ts), [overlay calculation](../../../phase1/src/lib/overlayTokens.ts).
- [Raster](../../../phase1/src/components/RasterEditor.tsx), [SVG](../../../phase1/src/components/svgedit/SvgEditor.tsx), [PDF](../../../phase1/src/components/pdfedit/PdfInlineEditor.tsx), [media signatures/state](../../../phase1/src/lib/media.ts).
- [Canvas menu](../../../phase1/src/components/CanvasContextMenu.tsx), [layer menu](../../../phase1/src/components/LayerContextMenu.tsx), [presence sanitation](../../../phase1/src/lib/collab/awarenessSafe.ts), [participant badge policy](../../../phase1/src/lib/collab/badgePolicy.ts).
