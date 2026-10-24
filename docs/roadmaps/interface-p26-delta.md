# Interface P26 delta

- Auto layout polish on top of the existing wrap/min-max/absolute engine and inspector:
  - Validated sizing limits: min/max width/height edits go through `setInterfaceSizingLimit` (range 0-32768, min never above max, unlocked layer), surfacing a guard error instead of silently patching; one undo per edit.
  - The wrap and absolute-child toggles migrated from raw checkboxes to the DS Checkbox with explanatory hints (wrap moves overflow to the next line; absolute pins out of the flow and follows constraints on resize).
  - Responsive preset preview now shows reflow: `diffInterfaceReflow` compares rendered bounds of the frame's direct children between the current size and the previewed preset (isolated copy, document/history untouched) and lists the first 8 changed layers with before/after rects, or a "layers keep their bounds" note. Hidden layers are skipped; the list is capped.
- Five locales via a P26 catalogue; DS Checkbox/Button/Field/NativeSelect only; no new dependencies.
