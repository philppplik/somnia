# Handover: PDF/layout tools UX spec (wave 5)

Branch: `docs/pdf-layout-ux-spec` from `somnia-agent` @ 427f8db. Docs plus one consistency test, no app code.

## Delivered

- `docs/design/pdf-layout-tools.md`: layout, wireframes, toolbar, thumbnails, properties card, tokens, 5-language key list, a11y, acceptance criteria.
- `phase1/src/lib/pdfUxSpec.test.ts` (node:test, picked up by `test:core` via `src/lib/*.test.ts`): checks that every `--token` named in the spec exists in `tokens.css`, that the i18n key table has unique `pdf.*` keys with non-empty en and de values, and that the spec contains no em dashes or TODO markers.

## Not done / open (honest list)

1. Engine choice and licences: left to the w4 research. The spec only assumes render-to-canvas, page ops, object placement, annotations, save-copy.
2. No locale JSON edited. The key table has en and de only; es, fr, pt-BR still need translation and native review.
3. Not rendered or visually checked: wireframes are ASCII. A real mockup (light/dark) is still needed before implementation. Nothing here was seen on screen.
4. Token contrast was not measured; the claim "AA in all palettes" is a requirement for the implementer, not a result.
5. Decisions for Philipp: save-copy default vs overwrite; whether PDFs should stop opening as read-only preview; font upload and embedding in v1; whether form fields (AcroForm) and digital signatures are in scope (not specified); text editing of existing PDF text (the spec only covers adding new text, editing original text is hard and engine dependent).
6. Group/ungroup, layers panel, page labels, bookmarks, OCR: out of scope.
7. Units default (mm vs inch by locale) and the Settings override are proposals.
8. Mobile/touch layout is described only at breakpoint level.
9. `Ctrl+Enter` / `F6` conflicts with existing app shortcuts were not checked against `commands.ts`.
10. Format-based modes (section 2a) are specified at table level only. Vector (SVG) mode needs its own spec; raster mode is a re-hosting of the existing Edit image dialog, not checked against its current panel sizes. The mode-registry shape is a proposal, not matched to existing code.
