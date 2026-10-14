# P1 remainder and bounded P2 adoption

Base: P1 commit `5a25c434`, plus P0. No new packages or component replacement.

P1 adds native Checkbox, checkbox-backed Switch and native RadioGroup. Labels, IDs, form names,
disabled and checked state remain caller-supplied. Checkbox exposes indeterminate/mixed without inventing a third saved value.
Native radio keyboard navigation skips disabled options. RadioGroup can explicitly prevent edits in read-only mode.
Checkbox/Switch retain native checkbox semantics; use disabled when edits are forbidden, not the ineffective native readOnly flag.
The state catalog at `state-catalog.json` lists real exports, tests and uncovered combinations instead of claiming a complete audit.

P2 is limited to StudioPill's Tooltip import. Its JSX names, classes, IDs, aria attributes, short names,
keyboard logic, 250ms provider delay and exact portal/positioner markup are unchanged.
The shared StudioTooltip compatibility namespace adds only a `data-slot` on Popup. Existing StudioPill tests pass unedited;
the isolated gallery compares facade popup computed styles with direct Base UI in all four theme/contrast cases.
Current `components/studios/` has no direct Dialog or Tabs consumers. OpenStudioDialog already uses ConfirmShell.
No Dialog/Tabs rewrite is invented to fill a phase name.

Verification: component-gallery tests include native boolean/radio keyboard behavior, mixed and disabled state,
plus existing parity/gesture/overlay cases. Unit rendering tests cover native roles, labels and form names.
All earlier gates remain, with no weakened tests or updated goldens.

Limit: this is a bounded P2 adoption, not completion of shell/studio migration. Code shell snapshot and real StudioPill app
E2E still run in CI; the component facade parity is not an app screenshot baseline. P3 remains blocked on those baselines.
No full accessibility certification, named palette matrix or native desktop test is claimed.

Roadmap delta: P1 boolean/radio controls and honest state catalog added; P2 StudioPill tooltip routes through the shared facade.
Broader P2 chrome work and P0 app/studio baselines remain open. P3-P6 not started.
