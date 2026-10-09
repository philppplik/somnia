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
