# Slides hero action: Present

Status: concept, no code.

## Hero action

**Present**, icon `Presentation`, as a split button. Main part starts the presentation from the current slide. Chevron: `Present from start`, `Export as PDF`, `Save a copy`, `Publish...`.

## Why

Keynote and Figma both put play/present in the top right, and Canva pairs Present with Share. People open a deck in order to show it. Publish makes no sense for a pptx.

## Important finding

There is **no presentation mode in the code today**. `SlidesCanvas` shows one rendered slide image with a sidebar, and the commands are `slides.undo`, `slides.redo`, `slides.saveCopy`, `slides.showSlide` (plus `loadThumbnails`, `selectText`, `editText`). Present is new work, not a button over something existing. The idea of a "preset" in the request is read here as a presentation mode; if Philipp meant a layout preset, say so.

## UX (v1)

- `Present` enters a full-window (and browser/OS fullscreen where allowed) view: the current slide image centred on black, nothing else.
- Keys: Right/Space/PageDown next, Left/PageUp previous, Home/End first/last, number then Enter jumps to a slide, `B` black screen, `Esc` exits. Click advances, edge click goes back.
- Small auto-hiding control bar at the bottom (previous, next, counter, exit), shown on mouse move, aria-labelled, announces "Slide 3 of 12" in a live region.
- Slides are the existing rendered images; the next slide is pre-rendered while the current one shows. Animations and transitions are not played (the engine does not provide them). The enter-present tooltip says so once: "Shows slides as static images."
- Shortcut: `F5` (from start: `Shift+F5`), as in PowerPoint. Check collisions.
- Disabled with tooltip "Open a presentation" when no deck is loaded.
- Later (not v1): presenter view with notes and timer, laser pointer. Speaker notes are not editable in the engine, so notes are out of scope.

## Reuses

- `slides.showSlide` for navigation inside present mode.
- Session image render and thumbnail cache (`useSlidesSession`, `loadThumbnails`).
- `slides.saveCopy` in the chevron menu.
- `deploy.open` for Publish.
- Studio context claim, so the AI sidebar knows "presenting slide N".

## Needs

- New commands: `slides.present` (`{fromStart?:boolean}`), `slides.present.exit`, `slides.exportPdf` only if the engine can render all pages to PDF; otherwise drop that menu entry. Check the engine before promising it.
- Present view component, key handling, fullscreen wrapper, i18n, tests including keyboard and reduced-motion.
- Slide render size: current preview may be too small for a projector. Render at screen resolution when presenting.

## Effort

Medium: about 2 to 3 days for v1 (view, keys, prerender, tests), plus about 1 day if PDF export is feasible. Highest effort of the three, and the only one with a new feature behind it.

## Open questions for Philipp

1. "Preset": presentation mode (assumed) or something else?
2. Is static-image presenting acceptable for v1 given no animations?
