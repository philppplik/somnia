# Studio starter screens

Every registered studio has one small starter when no editable document is open. The shared `StudioEmptyState` renders a studio glyph, an English headline, a short product description and two actions: open a supported file and create a blank project. Code also offers Open folder. Existing editor controls are unchanged once a document opens.

## Integration

```tsx
<StudioEmptyState
  studio="video"
  icon={<Film/>}
  onOpen={openVideoDialog}
  onCreate={()=>createBlankProject('video')}
/>
```

The component owns presentation, English product copy, busy state and inline errors. The studio owns file intake, document creation and persistence. `onOpen` and `onCreate` can return promises; rejection shows a visible alert, and both buttons are disabled while an action is pending. The surrounding section reports `aria-busy` and links its heading and description through unique IDs. No modal or autofocus is added. The layout wraps buttons and scrolls on short screens.

- Props: `studio`, `icon`, `onOpen`, `onCreate`, optional `testId`, optional `extraActions`.
- Copy: `src/lib/studios/starterCopy.ts`.
- Hooks: `<studio>-start`, `<studio>-open`, `<studio>-create-blank`. Sheets preserves its existing `sheets-empty` hook.
- `createBlankProject` is supplied by the separate blank-project implementation. Video hosts must accept both `video` and `video-project` media kinds.
- Design uses editable design projects and SVG export, not PDF editing. Additional Design/Vector hosts can reuse the component and register their own blank factory.
- Photos copy is ready for a dedicated host. At this base commit Photos remains the Code-host raster workspace; this patch does not register a non-existent Photos studio.

## Validation

Run `npx tsx --test src/components/studios/StudioEmptyState.test.tsx` from `phase1`. Ten tests cover all nine copy entries, accessible associations, both action labels, test hooks and extra actions. The test is included in `test:core`.

`phase1/validation/empty-states/preview.html` is a developer-only isolated preview using real app styles, not a shipped screen. Query parameters select `studio`, `theme`, `fail` (creation error) and `slow` (pending creation). Local Chromium checks cover all nine renders, open/create click forwarding, errors and busy state, dark/light Video and a 360 px Documents layout. Screenshots were visually inspected for readable copy, consistent spacing and wrapped buttons.

The base checkout has no generated WASM JavaScript/binaries and lacks the generated Slides declaration. A temporary declaration allowed TypeScript validation of the integrated blank-project dependency. No production engine was mocked or shipped. Full app E2E, production build and native verification remain integration gates on a checkout with built engines.
