# Component system: library and variants

Branch: `feature/component-system`. Status: Draft.

## What it does
- Save the selected source block as a **component**. It starts with one variant named "Default".
- Add more **variants** from other selected blocks (for example "Outline", "Wide"). The list shows how each variant differs from the default on the root element (`+btn-outline -btn-primary`).
- **Insert** any variant into the selected container. **Replace selection** swaps a placed block for another variant in a single edit, so one Undo brings the old block back.
- Mark one variant as the default, rename components, remove variants or components (confirm dialog).
- Inserted blocks get `data-somnia-component` and `data-somnia-variant` on the root tag so the panel can offer "Switch this block to ..." later. A checkbox turns the marking off (switching from the "Selected" box then no longer works for those blocks; "Replace selection" still does).

## Where the code is
- `phase1/src/lib/componentSystem.ts`: pure logic (model, limits, marks, ID checks, class diff, migration). No DOM, no storage.
- `phase1/src/lib/componentActions.ts`: localStorage (`somnia.components.v2`), editor operations (`insertHTML`, `replaceSource`).
- `phase1/src/components/ComponentSystemPanel.tsx`: the panel, shown inside the Components tab.
- Shared-file edits: `ElementsPanel.tsx` now renders `ComponentSystemPanel` instead of the old "Personal blocks" section. `componentLibrary.ts` is left untouched and no longer used by the UI (kept so nothing else breaks; remove later).
- Tests: `src/lib/componentSystem.test.ts` (12 unit tests), `tests/component-library.spec.ts` (updated for new labels, plus a variants test).

## Rules and limits
- 40 components, 8 variants per component, 100 KB per variant, names 1-60 characters, names unique (case-insensitive).
- Insert and switch refuse if the block would repeat a source ID. When switching, the IDs of the block being replaced do not count.
- Saved copies never keep the marker attributes.

## Storage and migration
Library lives in this app profile only (not in the project, not synced). On first load, the old v1 list (`somnia.components.v1`) is copied into v2, each old block becoming a component with a "Default" variant. v1 is not deleted.

## Known limits
- Switching replaces the whole block with the variant's HTML. Text edits made inside a placed block are lost on switch (Undo restores them).
- Editing an existing variant from a changed block is not in the UI yet (`updateVariant` exists in the logic).
- UI strings are hardcoded English.
