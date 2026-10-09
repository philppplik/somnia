# Design Studio verification

## Scope

Design Studio is an artboard/layout workspace. Its initial runtime seam is typed artboards with rectangle and text layers, creation without file input, JSON project import/export, SVG export, history, selection, movement and resizing. Vector Studio owns SVG editing. SVG reference inputs here are export/interchange or security test data, not an advertised Design import format.

## Coverage plan and spec skeleton

The model/API and final accessible UI labels must come from the integrated implementation. Do not replace them with broad text locators, skipped tests, guessed native JSON formats or an arbitrary in-test clone of the application model.

| Scenario | Model assertions | Browser assertions |
| --- | --- | --- |
| Start blank | Valid artboard, empty layer list, independent new project IDs | Choose Design, start without file picker, see canvas and named controls. |
| Add rectangle and text | Stable unique IDs, insertion/painter order, finite positive geometry | Create two named objects, select each and edit its inspector. |
| Move and resize | Precise geometry, immutable prior state, no unrelated layer change | Move selected rectangle; resize through inspector; check rendered bounds. |
| Undo and redo | Add/edit/delete restore exact project state; new edit truncates redo | Undo resize then insertion; redo restores geometry/content; no cross-tab change. |
| JSON round trip | Serialize/import retains artboards, IDs, order, text and geometry | Download JSON, read actual bytes, reopen in a new document and verify content. |
| SVG export | Valid XML, namespace/viewBox, layer order and text escaping | Inspect downloaded SVG; load safely and check solid-color reference pixels. |
| Invalid input | Reject malformed JSON, wrong version/type, duplicate IDs, invalid geometry | Failed import retains the open document; visible meaningful error; no crash. |
| Active-content text | XML escapes text and labels, never creates script/HTML nodes | Sentinel remains absent; no remote requests; export preserves literal text. |
| Independent documents | Edits and undo stay within the active project | Switch studio/tab and return; project and history survive. |
| Keyboard and focus | No model operation on editable-field shortcuts | Named focusable controls; shortcuts do not delete objects while typing. |

Only assertions supported by the shipped API should be enabled. Unsupported behaviors must be documented as test gaps rather than green checks. Each browser test uses a clean, empty session with the welcome popup dismissed. Downloads are inspected before being treated as successful exports.

## Deterministic fixture corpus

See [the corpus inventory](../../phase1/tests/assets/design-studio/README.md). The SVG fixtures cover stable layer order, geometry, Unicode, empty references, unsupported features, invalid input and harmless active-content sentinels. The corpus integrity test runs independently of Studio implementation:

```sh
cd phase1
npx tsx --test test/design/corpus.test.ts
```

These integrity checks verify the inputs only. They are not evidence that Design Studio imports, renders, edits or exports correctly. Native JSON fixtures and runnable integration specs are finalized against the core/tools contract, not against a proposed schema.

## Release evidence

Record the tested integrated commit, exact commands, pass/fail counts and limitations. Save screenshots for the blank state, edited artboard and selected-layer inspector in light and dark themes. Inspect those images directly for overlap, clipped copy, missing canvas objects and unreadable selection; merely saving screenshots is not visual verification.

For export pixels, use a rectangle away from text antialiasing and sample well inside its bounds. Platform font differences must not turn a semantic text check into a flaky pixel snapshot. Desktop save dialogs, actual filesystem writes and Windows/macOS behavior require desktop checks; browser downloads alone do not prove them.

## Verified snapshot (2026-10-09)

Test base: `6d9a126` plus supplied Design core initial/integration, Design tools, shared starter component and first blank-start patch. Generated WASM packages were supplied for local full-app loading. Later cross-studio blank/starter patches did not apply cleanly to this isolated base and are not included in this verification claim.

Results:

- `npx tsx --test test/design/*.test.ts src/lib/design/*.test.ts src/components/design/*.test.tsx`: 42 passed (28 independent QA/corpus/model/session checks plus 14 supplied core/panel checks).
- `npx playwright test design-studio-qa.spec.ts design-studio.spec.ts --workers=1`: 13 passed (12 independent QA scenarios plus the supplied core integration scenario), no retries.
- `npx tsc --noEmit`: passed with supplied WASM packages.

The independent browser suite verifies blank startup without a picker, layer insertion/editing, undo/redo, native and SVG download contents, invalid imports preserving the open project, hidden/locked layers, width validation, typing guards, multiple artboards and studio-switch retention. Native `.somdesign` fixtures include explicit opacity, rotation and stroke defaults, matching the final parser's canonical output.

Screenshots of the blank artboard, edited layers and selected rectangle inspector were opened and visually inspected in the light theme. Canvas objects, selection outline and resize handle are visible; the inspector is readable and scrollable. Dark-theme pixels and desktop behavior remain unverified. A screenshot filename ending in `dark` from the supplied core test does not prove the theme was dark.

Observed integration gaps, outside the private Design session's green scenarios:

- The global left panel and footer still say "No project open" with an active unsaved Design document.
- The Design studio pill uses the Code icon fallback until the shared glyph map gains `LayoutTemplate`.
- Generic file/drop routing, global save/dirty-close handling, global undo dispatch and persistence are explicitly left to the builder in `phase1/docs/design-studio/core.md`. Local downloads and in-canvas history do not prove these seams.

Tests intentionally use panel test IDs for text and geometry fields, and the row's layer-kind label for selecting a locked layer. Clicking its disabled rename button is not a valid selection action and was corrected in the spec, not bypassed by forcing a click.

Run all independent checks after integration:

```sh
cd phase1
npx tsx --test test/design/*.test.ts
npx playwright test design-studio-qa.spec.ts --workers=1
```

These files are deliberately not wired into `package.json` by QA to avoid conflicting with the builder's shared script edits. Add `test/design/*.test.ts` to the integrated core test command.
