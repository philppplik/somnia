# Layout helpers (layer menu)

Right-click a layer that has children: "Layout: row, centered", "row, spread out", "column, centered", "column, start". Each writes one class rule (display:flex, flex-direction, justify-content, align-items:center) through the normal setStyle path, scoped to the current breakpoint, one undo step. Needs an explicit head element, like all visual style edits. Not yet: spacing guides, distribute, canvas handles.

Align presets: "Align: center this block" (margin auto), "Align: text left/center/right" in the same menu, same setStyle path, one undo step each. Canvas spacing guides and distribute still open.
