# P1 primitive package

Base: the two P0 commits through `f7cef500`, on top of `int/shell` `22fe72d8`.
No existing app consumer migrates in this package. Settings/P3 is not started.
No new third-party dependency: Base UI 1.8.0, React, Vite, Tailwind and Playwright were already installed.
This package implements the requested P1 field/panel/notice/overlay subset, not every item in the larger migration concept.

## Exported contracts

| Module | Contract |
| --- | --- |
| `ui/field` | Field takes caller text and a render function receiving control id, description ids and invalid state. FieldMessage supports caller-supplied errors. No validator or application state. |
| `ui/native-controls` | NativeInput, NativeSelect, Textarea preserve native element semantics, props/events/refs and bare global/bento geometry. Existing styled Input remains untouched to avoid a consumer visual change. |
| `ui/number-field` | Caller parser/formatter, localized parse and constraint error text, units, null/mixed, disabled/read-only, limits, step and identity resetKey. Enter/blur commit once; Escape restores; arrows parse and commit one bounded step. No opacity conversion or engine write logic. |
| `ui/range-field` | Controlled preview plus begin/commit/cancel callbacks. One pointer/keyboard gesture. Escape, pointer cancellation, lost capture, disable/read-only and unmount clean up. Caller owns preview rollback and undo transaction. |
| `ui/panel` | PanelBody, PanelHeader, controlled PanelSection and PropertyList. Collapse storage/registry remains in shell adapters. Rows have explicit stable IDs. |
| `ui/notice` | Caller text and info/success/warning/danger tone. Silent by default; caller chooses polite/status or assertive/alert. No raw-error extraction or retry policy. |
| `ui/menu` | Existing Base UI root/trigger/group/submenu/check/radio parts plus shared portal-positioner-content and menu item classes. Base UI disabled items are focusable but cannot activate. |
| `ui/tooltip` | Existing Base UI provider/root/trigger plus production studio-pill tooltip surface and collision-aware positioner. |
| `ui/popover` | Existing Base UI root/trigger/title/description/close plus shared portal-positioner-content. No export or action state ownership. |
| `ui/icon-button` | Existing Button with required accessible name and icon/row geometry. |

New controls have `data-slot` and preserve caller class, id, data attributes and native props.
Field callbacks should spread supplied relationships onto the actual control; additional descriptions can be joined.
NumberField `constraintError` is caller-provided text so even parser-success values outside native bounds have an honest error.
Set resetKey when selection identity changes without changing the displayed value.
Normal `Input` parity still needs a separate reviewed API decision: its current h-9 styling is not equivalent to bare inputs.
Checkbox/Switch/RadioGroup, a full P1 state catalog, and the proposed Storybook integration are not claimed implemented here.

## Development gallery and gates

From `phase1/`:

- `npm run dev:ds` serves the local synthetic component gallery at `/test/design-system/`.
- `npm run test:ds:unit` runs SSR contract tests.
- `npm run test:ds:parity` uses an isolated Vite configuration and Playwright; no app store, engines,
  provider flows or production prerequisite bypass. The real primitives and production global/bento styles are imported.
- `npx vite build --config test/design-system/vite.config.ts --outDir /tmp/ds-gallery` builds only this gallery.

Parity compares backgrounds, ink, borders, radii, padding, type, shadow and outline in light/dark and standard/high contrast.
Native controls compare directly with raw elements; overlay wrappers compare with direct existing Base UI markup/classes.
Tests include disabled/read-only fields, focus, relationships, invalid/empty/out-of-range/mixed numeric drafts,
Enter+blur duplicate prevention, Escape/arrow steps, keyboard and pointer range gestures/cancellation, menu navigation/typeahead,
disabled non-activation, overlay Escape/focus return, reduced motion and the production `--ui-zoom` 85/130% scale (root content zooms, portals stay document-level).
Screenshots are review evidence, not new canonical pixel snapshots or threshold changes.
CI runs unit/parity gates and retains gallery evidence; all existing assertions/snapshots stay unchanged.

The ratchet has explicit raw-control-only exceptions for four primitive modules. They still count color, typography
and inline-style debt. App consumer budgets are unchanged. Baseline refresh remains reduction-only.

## Remaining verification

The gallery is not an app/studio screenshot baseline. P0 per-studio and major-dialog baseline captures and real app E2E
remain CI work. Full typecheck still requires the generated `slides-engine/pkg/somnia_slides.js` artifact.
Native desktop rendering and a full accessibility/contrast audit are not established by computed-style parity.
Before any consumer migration, preserve its commit/preview/undo semantics and attach app before/after pixels.

Roadmap delta: requested P1 field/panel/notice/menu/tooltip/popover subset, isolated gallery and additive gates implemented.
Remaining P1 controls/complete state catalog and P0 studio baselines remain open. P2-P6 not started.
