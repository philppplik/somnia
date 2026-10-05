# Empty Layers sidebar

Base: phase1-foundation, v9.19.0 (08fa6ee). Branch: fix/empty-layers.

## Cause and change

The initial app store still contained prototype nodes even though main.tsx starts without a project. Remove those nodes and phantom index.html tab/file/name. The Layers panel now renders "No project open" with an open-file/folder hint whenever no editor project is connected, without a filter, filename, Demo badge or sample-hierarchy note. Connected projects retain their normal tree/filter/selection/drag behavior. Separate messages cover an HTML document with no visible layers and a project without HTML. Closing a project clears local filter/collapse state.

Changed code: phase1/src/store/appStore.ts, phase1/src/components/LayersPanel.tsx.
Regression tests: phase1/tests/empty-layers.spec.ts (six scenarios: clean start light/dark, blank page and close/reload, HTML file, CSS-only file, folder, restored draft).

## Validation

- npm run typecheck: pass.
- npm run build: pass (existing chunk-size and mixed dynamic/static import warnings).
- npm run test:core: 263/263 pass.
- Playwright with two workers: 26/26 pass across empty-layers, empty-start, layer-dnd, shell, draft-restore and folder-drop.
- A later full-suite attempt with six workers did not complete: widespread timeouts under load; interrupted and stopped. A shard retry collided with the still-running server. Full-suite green is not claimed.
- Inspected screenshot pixels for empty light/dark and an opened HTML file with selection. Empty-state text is readable and fits; open-file layers are real and selection is visible. The existing Inspector still says Demo with nothing open; existing dark-theme buttons also have poor contrast. These are outside this Layers fix.

## Windows checks

1. Close any current project, quit and launch: Layers contains only the empty hint, no header/nav/main/footer, index.html or Demo badge.
2. Open an HTML file and then a folder: real file name/tree returns; selection and filtering work.
3. Filter to no matches; close the project and open another: no stale filter and no sample tree.
4. New blank page: no layers is a document-empty message, not the no-project state.
5. Restart with an unsaved draft: restored real layers remain visible.
6. Open CSS-only project: no HTML document message, no demo nodes.

No native Windows run, push, merge or release was performed. Native filesystem behavior is unchanged; existing native-drop tests use mocked IPC. Risk is limited to removal of initial placeholder file/name state; restore/open flows and existing shell tests passed.
