# New-studio DS adoption

Initial base: `origin/int/beta5` 626bc7c8, fetched again before edits; rebased cleanly onto 63dfc7f4 after Animation P1 landed. Animation P1, 3D through step4,
Interface through P3 are real implementation inputs, not the earlier concepts. No changes to other studios.

| Studio | Small adoption delivered | Remaining checklist |
| --- | --- | --- |
| Animation | shared NumberField adapter for transforms and composition values; Field owns numeric labels; selection/playhead resetKey | [ ] real inspector pixels [ ] locked selection [ ] keyframe/session undo [ ] bounds/domain errors |
| 3D | transforms, FOV and bounded light/snap/output numeric controls use adapter; selected object resetKey | [ ] real inspector/WebGL pixels [ ] command error [ ] drag-vs-numeric undo [ ] lock/busy [ ] native export |
| Interface | common text/color Field supplies label/control relationships; numeric Field uses NumberField; layout/component groups use controlled PanelSection | [ ] real layout pixels [ ] instance restrictions [ ] domain errors [ ] selection changes [ ] snapshots/import/export |

Adapter: `components/studios/InspectorNumberField.tsx`, exclusively for these new inspectors.
Finite nonempty decimal drafts, caller bounds, localized `schemaForm.invalid`, Enter/blur once, Escape restore,
arrow step, optional selection reset key. Domain validation and engine/session writes stay in existing handlers.
Interface native text/color retains its blur commit/cancel policy. Group collapse is local UI state, not serialized document state.
Existing test IDs, commands, parsers, session undo and disabled flags remain the owners.

Behavior additions: validated numeric invalid input stays visible with an error instead of silent discard;
Escape cancels numeric drafts and labeled numeric wrappers show axis/property labels. Review on CI, especially
narrow three-column transform rows. No ranges moved to RangeField: those streams currently write commands
on each change, so gesture transaction redesign is not a safe wrapper-only change.
No global shell PanelSection replacement, registry/session rewrite, or broad fixed-height change.

## Evidence and gates

Local: existing Interface SSR tests, new adapter SSR tests and isolated browser draft/commit/identity/lock/collapse tests.
Isolated screenshots show actual adapters with production styles, not full studios or engine execution.
Actual app existing animation-p0.spec.ts, studio3d.spec.ts and interface-studio.spec.ts remain CI-only.
Full typecheck needs this branch's existing three dependency and generated slides engine. No dependency added by adoption.
The integrated check:ds ratchet has preexisting agent/new-studio budget overages; do not increase budgets to hide them.
Have the integrator review/update area ownership separately or finish broader adoption before changing the ratchet.

Roadmap delta: additive three-studio inspector primitives adopted; non-Settings chrome plan/capture starter added.
Broader menu/dialog migration and full app/native proof remain open. No Settings rewrite.

Final rebase retains Interface P4 multi-select and Animation P1 output. Existing Interface SSR now includes
five cases; adoption adds four adapter/real-inspector SSR cases. Full isolated gallery: 49 cases passed.
No broad-ratchet budget or existing test was changed. Shared NumberField is text/inputMode decimal with
bounds checked on commit, not a native number input's min/max DOM attributes.
