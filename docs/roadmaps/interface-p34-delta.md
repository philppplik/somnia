# Interface P34 delta — typography + text polish

Base: P33 commit (stacked; P33 not yet upstream at build time). Scope check first: text styles (generic families, weight presets 400-700, size, line height, per-mode values) already existed — variable-font axes are not supported by the existing font handling (system generic families only), so per the assignment fallback width became a preset. Gaps built:

1. **Font width presets** (`InterfaceTextStyle.fontStretch`): normal/condensed/expanded, rendered as font-stretch 75%/125% in exports and on canvas.
2. **Paragraph spacing** (`InterfaceTextStyle.paragraphSpacing`, 0-200 px): extra offset between explicit text lines in exports and a row gap on canvas.
3. **List styles** (`InterfaceNode.list`: bullet/number): per-line markers with indentation in exports and on canvas, one undo per change.
4. **Text truncation** (`InterfaceNode.maxLines`, 1-100): clips to the first N lines with an ellipsis on the last visible line, one undo per change.
5. **Text-overflow accessibility check** (`a11y.text-overflow` finding): deterministic vertical overflow from the explicit-line text model (line height x lines + paragraph spacing vs layer height); suppressed when max-lines truncation already indicates the clipping. A horizontal estimate was prototyped but dropped: without font metrics it produced false positives on legitimately small layers.

Tests: 347 focused tests green (+6: 5 lib tests, 1 EN/DE render test). Gates: check:ds, check:ui-commands, check:commands, check:layers all pass; tsc clean apart from known upstream studio3d/slides/stage noise. CI-only spec `Interface P34 list style and max lines edit with one undo each` added; acceptance paragraph P34 added. Light/dark screenshots inspected (EN light, DE dark: bullet marker rendering on canvas, Liste/Maximale Zeilen controls; canvas text rendering gained the new features too after an initial export-only gap was caught in review).
