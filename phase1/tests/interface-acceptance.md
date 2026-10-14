# Interface acceptance in CI

`tests/interface-studio.spec.ts` is included by the existing Playwright config and `npm run test:e2e` frontend CI step in `.github/workflows/phase1-core-bootstrap.yml`. No extra runner, paid service or duplicated workflow is added. Required generated engines and the app build are CI-owned. Do not run full application acceptance or Cargo/WASM builds in this sandbox.

| Increment | Blocking spec intent |
| --- | --- |
| P0/P1 | Shell switch/blank document, panels, cancelled and committed gesture, undo/redo, invalid edit rollback, recovery/reopen, malformed snapshot refusal; auto-layout/component variant/instance/detach controls |
| P2 | Local token/grid controls, SVG/PNG download, manual readiness/frozen handoff, unchanged dirty state |
| P3 | Local SVG snapshot into frame, pen cancel versus single commit |
| P4 | Shift multi-select, align/duplicate/undo, page naming/frame reveal, internal frame clipboard |
| P6 | Local click/hover link authoring, parent resize/stretch, frozen preview keyboard/back/Escape and unchanged source/recovery |
| P5 | Page-wide multi-frame freeze, 2x PNG preset, token/geometry CSS snapshot frozen across later source edit |

These are executable specifications, not a claim that CI has passed. Model/unit tests separately cover component propagation/semantic slots, layout, malicious imports, export escaping/limits and transactional save behavior. Native host save/reopen and full shell production gates are separate. Pixel inspection of the isolated fixture is not application E2E.

P7 adds named variant selection and frame mode/detach preservation. Pure tests cover slot overrides across property switches, mode inheritance/aliases/styles/SVG, invalid modes/combinations and smart sibling snapping. Rulers are scene-coordinate chrome, not a source document field.

P8 adds library snapshot download, local overlay open/close/Escape and unchanged recovery. Pure tests cover wrapped flow-to-absolute rebase and pin/scale resize preview-versus-commit.

P9 adds `Interface P9 tree keyboard resize undo and frozen 3x PNG/snippets` (CI-only application acceptance). Prior nine cases retain assertions, with locators migrated from list/buttons to actual tree/treeitems and named canvas groups. Owned pure tests cover 3x budgets, pre-abort/no allocation, inert escaping and layout snippets, roving parent/child/Home/End order and shared keyboard resize/undo. Isolated real-component Chromium verifies 3x encoded PNG, delayed encoder cancellation without download, source recovery unchanged, keyboard resize/undo and tree focus; not app E2E. No screenreader certification claimed.

P10 adds `Interface P10 device preset, cross-page clipboard and snapshot ruler settings` (CI-only). Pure tests cover page reorder/duplicate undo, copied hierarchy/internal prototype remap/local component semantics, 100-page/preset validation, page-local settings reopen/recovery/rollback, and same-document cross-page paste undo. Isolated actual components verify preset dimensions, page paste/duplicate/reorder and explicit snapshot reopening of guides/rulers; light/dark screenshots inspected.
