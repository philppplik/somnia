# Wrap and unwrap
- "Wrap in div" (layer right-click, or Ctrl+K "Wrap selected element") puts the element's exact source inside a new `<div>`.
- "Unwrap (keep content)" replaces an element by its children. Needs at least one child element; elements with only text should be deleted instead.
- One undo step each. Roots (html, head, body) are refused. Selection is cleared afterwards.
- Dreamweaver pain point: grouping elements without hand-editing tags.
