# Design Studio: tools, layers and inspector panels

Scope: the pure UI panels of the Design Studio. The document model, session, canvas and export live in the core files of the Design Studio (`model.ts`, `session.ts`); these panels never import them.

## Files

| File | Purpose |
| --- | --- |
| `src/lib/design/panelContract.ts` | Read-only view types and callback props. This is the whole seam to the core. |
| `src/lib/design/tools.ts` | Tool definitions (`select`, `hand`, `frame`, `rectangle`, `text`), shortcuts, `toolForKey`. |
| `src/lib/design/inspectorModel.ts` | Pure helpers: `shared`/`MIXED`, `parseNumberField`, `normalizeHex`, `alignPatches`, `distributePatches`. |
| `src/lib/design/i18n.ts`, `src/locales/design/*.json` | Strings in en, de, es, fr, pt-BR. Merged in `src/lib/i18n.ts`. |
| `src/components/design/DesignToolbox.tsx` | Vertical toolbar. |
| `src/components/design/DesignLayersPanel.tsx` | Layers outline. |
| `src/components/design/DesignInspectorPanel.tsx` | Properties of the selection. |

## Contract

The core adapts its model to `DesignNodeView` (flat, top-most layer first, `depth` for nesting; `frame` = artboard, `rectangle`, `text`). Panels report intent only:

- `onChange(patch: DesignNodePatch)`: apply to every selected node as ONE undo step. Opacity is 0..1 in the patch (the field shows percent). Colours are `#rrggbb` or `null`.
- `onAlign(kind)` / `onDistribute(axis)`: the core calls `alignPatches` / `distributePatches` on the selection and applies the result as one undo step. Locked nodes are skipped.
- Layers: `onSelect(id, additive)`, `onRename`, `onToggleVisible`, `onToggleLocked`, `onReorder(id, +1|-1)`, `onDelete(ids)`, `onDuplicate(ids)`.
- Toolbox: `active`, `onSelectTool`. Tool ids `frame`/`rectangle`/`text` create an artboard, rectangle or text layer by drag or click. `toolForKey(e)` maps single-key shortcuts (V H F R T) and ignores inputs and modifier combos; the host wires one keydown listener.

Not duplicated here: undo/redo, add-rectangle/add-text buttons, export and import controls (core provides these with its own test IDs). The empty state and blank-project start come from the shared studio starter component.

## Behaviour

- Numeric fields commit on Enter or blur, Escape reverts. Input is validated strictly (decimal comma allowed; units, `NaN`, `Infinity`, exponent notation rejected). Out-of-range and invalid values show an inline `role="alert"` message and are never sent to the document.
- Ranges: width/height >= 0.01, rotation -360..360, opacity 0..100 %, radius >= 0, stroke width >= 0, font size 1..1000.
- Multi-selection shows "Mixed" where values differ. Setting a field writes it to all selected nodes.
- Locked nodes disable the inspector; layer rename is disabled for locked layers.
- Alignment uses the joint bounding box (needs 2+ nodes); distribute needs 3+ and keeps the outer nodes fixed.

## Test IDs

Toolbox: `design-toolbox`, `design-tool-{select|hand|frame|rectangle|text}`.
Layers: `design-layers-panel`, `design-layers-empty`, `design-layer-row` (`data-layer-id`, `data-layer-type`), `design-layer-name`, `design-layer-name-input`, `design-layer-visible`, `design-layer-locked`, `design-layer-kind`, `design-layer-up`, `design-layer-down`, `design-layers-duplicate`, `design-layers-delete`.
Inspector: `design-inspector`, `design-inspector-empty`, `design-inspector-title`, `design-section-{layout|align|appearance|text}`, `design-field-{x|y|width|height|rotation|opacity|radius|strokeWidth|fontSize|fill|stroke|text}`, `design-field-{id}-error`, `design-field-{fill|stroke}-picker`, `design-align-{left|centerH|right|top|centerV|bottom}`, `design-distribute-{horizontal|vertical}`.

## Tests

`npm run test:core` includes `src/lib/design/design.test.ts` (parsing, hex, mixed values, align, distribute, shortcuts) and `src/components/design/design.test.tsx` (render states, labels, locale parity).
