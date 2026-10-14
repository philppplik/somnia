# P4 new-studio token and accessibility audit

Scope: Animation, Interface, 3D only. No Settings or agent UI rewrite.

| Area | Finding / action | Evidence / remaining gate |
| --- | --- | --- |
| Inspector numerics | shared label/control ID, visible focus outline, semantic ink/surface, bounded drafts | six isolated light/dark x density checks, SSR actual inspector contracts; real app CI matrix |
| Group collapse | PanelSection button expanded/controls IDs, body unmounts while closed | isolated keyboard/control test; full inspector pixel review |
| 3D marquee | replaced fixed purple CSS paint with focus-ring / accent-soft | source token test; actual WebGL selection pixels on CI |
| Animation path key marker | hardcoded white stroke replaced by action-ink; selected ring focus-ring | source token test; varied authored backgrounds need actual compositing review |
| Interface stroke default | #202124 is authored document default, not shell chrome | deliberately retained; do not recolor user's content with app theme |
| Animation source fill default | white is authored layer default, not shell chrome | deliberately retained |
| Density | 3/6/10px gap, independent 25px outer radius; inputs not globally resized | six isolated computed checks; narrow/long inspector layout still review |
| Status/quiet text | semantic ink-2/ink-3 used in new panels | full quiet label/background pair contrast not certified across arbitrary imported/named themes |

Local browser audit verifies numeric input ink/background >=4.5:1, visible >=2px outline,
exactly one associated label and gap/radius invariants in default light/dark x three densities.
These are production-styled adapters, not proof of every full studio tree or authored-background overlay.
Actual app CI-only `tests/new-studios-ds-a11y.spec.ts` adds an 18-case studio/theme/density matrix,
creating real blank content and testing one representative numeric inspector per studio plus screenshots.
No screenshot thresholds/goldens changed. No new dependency. It does not cover every control or claim WCAG certification.

Still required: inspect actual screenshots for narrow axis labels/clipping; keyboard traverse all control groups;
high contrast plus custom/imported colors; quiet-text pairs; disabled/error/mixed/instance states;
3D marquee and Animation key markers over light/dark/colored authored backgrounds; screen reader review.
Full engine-driven app checks stay CI-only. Do not substitute an isolated adapter screenshot for these gates.
