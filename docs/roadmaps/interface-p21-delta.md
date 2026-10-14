# Interface P21 delta

- Design lint + accessibility panel upgrades on top of the P16 review:
  - Contrast findings now carry the WCAG AAA reference (`aaa` param; 7:1 normal, 4.5:1 large text) next to the existing AA threshold, variable bindings included via the resolved copy.
  - New finding kind `label`: interactive layers (prototype links) with no text content, no text descendant and no alt text are flagged; hidden text does not count.
  - New finding kind `overflow`: layers whose accumulated frame-space bounds extend beyond an ancestor frame are flagged once (nearest first) as clipping hints.
- Panel UX: every finding is a button that selects the layer (page switch + canvas reveal); contrast token suggestions keep the P16 text and each gains an Apply quick-fix button that sets the suggested token fill as exactly one undo step. All findings stay non-blocking warnings; the audit remains display-only (frozen resolved copy, no document or history writes).
- P16 test fixture: the image child is sized to fit its frame because the new overflow lint legitimately flags the old oversized fixture child; all P16 assertions otherwise unchanged.
- Five locales (AAA copy updated in the P16 catalogue plus `a11y.label`, `a11y.overflow`, `a11y.apply` in a P21 catalogue); DS buttons only; no new dependencies.
