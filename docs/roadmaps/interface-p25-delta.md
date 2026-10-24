# Interface P25 delta

- Conditional, variable-driven prototype interactions (bounded, no scripting/eval):
  - Links carry an optional `condition` (variable + fixed equals value, plain string compare) and an optional `elseTargetFrameId`; on a mismatch the preview either follows the else target or stays put with a notice. The else branch navigates without a transition.
  - Links carry up to 4 fixed `setVariables` setters (variable <- literal value); setters apply before the condition is evaluated, number variables coerce and validate numerically, color variables stay strings. Same-frame links work as setter-only clicks (no history push).
  - The schema validator bounds the new link fields (known variable ids, 1-64 char values, unique setter variables, visible page-root else target) and keeps the 500-link budget.
  - The preview player holds runtime variable state (initialised from the document, reset on restart) and shows a Variable state panel listing each variable with its current value and a "changed" marker.
  - The static HTML preview export applies the same bounded rules: setters and conditions work offline in the frozen runtime.
- Inspector: per-trigger condition variable select ("If variable", default Always), equals field, else-target select, setter rows with remove plus an add button capped at the budget.
- Five locales via a P25 catalogue; DS Button/Field/NativeSelect only; no new dependencies.
