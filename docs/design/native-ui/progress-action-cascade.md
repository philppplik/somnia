# P7 progress and action cascade

Base: int/beta5 2b139399. No Settings rewrite, artifact approval, dependencies or engine changes.

## Root cause and fix

The shared Button common class list supplies neutral `hover:not-disabled:bg-hover`.
Primary supplied filled paint and paired hover ink, but no primary hover background.
On default themes hover therefore became gray while keeping primary foreground. A custom inline accent
could hide the bug in token inheritance. The failing regression observed default fill switching to rgb(229,229,235).
Primary now explicitly supplies `hover:not-disabled:bg-accent-fill`; cn removes the conflicting utility.
Photo export no longer forces white ink over a custom light accent. Existing theme/seed/high-contrast owners remain.
No blanket unlayered CSS reset or utility-layer move.

## Progress presentation

StudioProgress provides a named native progressbar (bounded/clamped or truly indeterminate), atomic polite
status, busy state and optional real cancellation callback. No fake cancel, progress polling or engine completion.
Animation sequence export and 3D turntable retain real cancel handlers; single Animation frame has no cancel.
Photos and Interface export show indeterminate local work, with no unsupported cancellation promised.
Existing operation handlers, progress test IDs, export consent/format and memory/save semantics remain.
Progress paint uses the semantic accent fill; browser default green is not the design-system contract.

Tests: SSR bounds/indeterminate/cancel capability; isolated default-hover regression, custom yellow/light/dark
paired ink and keyboard cancel action. Full app export jobs still require existing CI engine tests and pixel review.
The integrated source already has new Animation/Interface ratchet growth; this patch does not raise budgets.
Settings Appearance stays on hold until reviewed beta.4 BEFORE artifacts arrive.
