# Studio switcher chrome

The header studio pill highlights the active studio with a white tab and dark
ink. The selection stays white when hovered and in dark or tinted themes.
Inactive studio buttons keep their compact glyph-only shape. The active tab
uses the same short product name as its tooltip. Full localized accessible
names and selection announcements remain unchanged. The global pill stays
mounted in every studio, including Vector and legacy raster editing.

Hovering a studio glyph shows a short product name below the pill after 250 ms.
The current names are Code, Docs, Sheets, Slides, Sound, Photos, Video, Design,
Vector and Vibe Space. The same name is available on keyboard focus and describes its trigger for assistive
technology. Escape dismisses the tooltip without moving focus. Native title
bubbles are disabled to avoid competing tooltips.

The existing radiogroup behavior is preserved: arrow keys select adjacent
studios, Home and End select the first and last studio, and only the selected
studio participates in the Tab order. Merely hovering does not switch studios.
The live region still announces the full selected studio name.

## Registration and future studios

`StudioPill` lists only runtime-ready registered studios. Compact product names
live in `components/studios/studioShortName.ts` for all ten registered studios.
This does not register studios or add placeholder buttons. An unknown studio falls back to its translated label
with a leading `Somnia ` removed.

The selected-tab CSS is scoped to the pill. Other buttons and document tabs are
unaffected. Tooltip surfaces follow the current theme. Windows forced-colors
mode uses Highlight/HighlightText instead of forcing white over the user's
system colors. No layout animation was added.

## Verification

- `npx tsx --test src/components/StudioPill.test.tsx src/lib/studios.test.ts`
- `npx playwright test tests/studio-pill-chrome.spec.ts`

The Playwright spec checks white selection in light and dark modes, persistence
on hover, selection transfer, all ten current short names, hover without studio
changes, tooltip dismissal, accessible descriptions and keyboard navigation.
Regression coverage switches through all ten studios and enters Vector while
a legacy raster request is still active.
A full app run needs the generated WASM bridges, as documented by each studio.
