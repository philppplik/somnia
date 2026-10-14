# Interface P37 delta — responsive breakpoint view in the flow preview (picked gap)

Pick: responsive breakpoints preview. Variants/states table already shipped as the P33 matrix editor; export-to-code already has handoff snippets (CSS + React-ish), token exports and dev mode. Breakpoints existed as data, a canvas-level size preview and a responsive issue audit, but the flow preview player always rendered frames at native size — that was the highest-value gap.

Built:

1. **Breakpoint view in the preview player**: per frame a picker offers Native size plus every defined breakpoint with its dimensions. The current frame renders from a view-only resized clone (`previewInterfaceBreakpoint`) with auto-layout reflow applied; hotspots, sticky layers and the viewport follow the resized layout, so interactions keep working at the breakpoint size. Navigation clears the override; the source document, history and recovery stay untouched.
2. Bug caught by the pixel check: the frame-change effect reset the breakpoint selection immediately after applying it (selection never stuck); the reset now keys on navigation only.

Tests: 361 focused tests green (+3: 2 lib tests, 1 EN/DE render test). Gates: check:ds, check:ui-commands, check:commands, check:layers all pass; tsc clean apart from known upstream studio3d/slides/stage noise. CI-only spec `Interface P37 breakpoint view in the flow preview player` added; acceptance paragraph P37 added. Light/dark screenshots inspected (EN light + DE dark: Gallery frame reflowed from a 3-up row to full-width stacked tiles at Mobile 390x844).
