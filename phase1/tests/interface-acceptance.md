# Interface acceptance in CI

`tests/interface-studio.spec.ts` is included by the existing Playwright config and `npm run test:e2e` frontend CI step in `.github/workflows/phase1-core-bootstrap.yml`. No extra runner, paid service or duplicated workflow is added. Required generated engines and the app build are CI-owned. Do not run full application acceptance or Cargo/WASM builds in this sandbox.

| Increment | Blocking spec intent |
| --- | --- |
| P0/P1 | Shell switch/blank document, panels, cancelled and committed gesture, undo/redo, invalid edit rollback, recovery/reopen, malformed snapshot refusal; auto-layout/component variant/instance/detach controls |
| P2 | Local token/grid controls, SVG/PNG download, manual readiness/frozen handoff, unchanged dirty state |
| P3 | Local SVG snapshot into frame, pen cancel versus single commit |
| P4 | Shift multi-select, align/duplicate/undo, page naming/frame reveal, internal frame clipboard |
| P5 | Page-wide multi-frame freeze, 2x PNG preset, token/geometry CSS snapshot frozen across later source edit |

These are executable specifications, not a claim that CI has passed. Model/unit tests separately cover component propagation/semantic slots, layout, malicious imports, export escaping/limits and transactional save behavior. Native host save/reopen and full shell production gates are separate. Pixel inspection of the isolated fixture is not application E2E.
