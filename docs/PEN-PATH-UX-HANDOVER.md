# Pen and path UX handover

Date: 2026-10-07.
Base: somnia-agent, 427f8dbd2478d361b544a8cf81c4fd9dc0b7b631.
Branch: docs/wave4-pen-path-ux.

## Delivered

PEN-PATH-UX-RESEARCH.md: English source-backed comparison of Illustrator, Figma, Inkscape and Penpot; proposed Pen states, handle constraints, Layers, shortcuts, Shape Builder and edge-case tests. Honest open-decision list included.

Penpot develop source pinned at cb1118f9045c83784008e2d8ae112abbb3f99320. MPL-2.0 and ClojureScript integration implications recorded. No code, translated source, assets or dependencies imported.

## Validation and limits

Cited page bodies and source files read. Markdown table consistency and diff whitespace checked. No unit tests run because this is docs-only; future node:test/test:core cases are listed, not claimed complete. No hands-on competitor UI or visual layout audit performed.

No push, PR, CI trigger, paid API or runtime changes. Central builder owns integration. Apply the patch or fetch the branch from the bundle, not both. Both docs are new.

## Decisions needed before implementation

Path versus network model; Escape finish/cancel; handle-uncoupling persistence; geometry engine; Boolean/Shape Builder styles, cutters and untouched regions; keyboard collisions; SVG metadata persistence. Recommend ordinary paths and Corner/Smooth/Symmetric first, editable Boolean groups before staged Shape Builder.
