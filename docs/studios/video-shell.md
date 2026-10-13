# Video studio shell

The Video manifest is pure data in `phase1/src/lib/studios/video.ts`. Components are registered once by `components/video/registerShell.ts`, imported by `App.tsx`. The canvas owns the live studio context; no media content or bytes are published through that context.

## Rails and panels

- Files opens the shared file browser.
- Sources lists the open video sources, with a persisted filter and an Add button for each source. Add from file opens the existing video picker and returns to the project tab.
- Sequence lists ordered clips and their timeline ranges. Select a row to edit its properties. Add a title, split the selected clip in half, or reset the timeline from this panel.
- The right rail opens the generic inspector. Its sections show source facts, the selected clip, audio and outgoing transition, and export settings.
- Add title is a command rail item in overflow by default. It appears only while the session is ready.

All glyphs come from the shared rail icon registry: Film for sources, Layers for the sequence, Type for title creation and SlidersHorizontal for properties. Files, Sources and Sequence are pinned by default. Users can reorder, pin, hide and reset the rails using the shell's existing customization controls. Sources is the default left panel; the inspector is open on the right.

## Selection and edits

`VideoCanvas` claims the studio context for the active media tab and releases it when unmounted. It reports the document name and kind, whether the timeline differs from the original source, selected clip id/type, duration, clip count, and ready/exporting services. A stale canvas cannot publish into another canvas's claim.

Media clips expose in/out bounds, gain and mute. Title cards expose text, duration, colours, font, size, emphasis, alignment and fades. The next clip controls whether an outgoing crossfade field is shown. Timeline edits reuse the existing session functions, including source-bound trimming, minimum clip length and gain limits. The last remaining source clip cannot be deleted from a normal media tab; a blank project may become empty.

All new panel actions dispatch through `lib/video/commands.ts`. The 18 specs are registered while VideoCanvas is mounted and disposed on unmount. Payload schemas reject unknown fields, invalid ids, non-finite or out-of-range numbers, unsupported title values and invalid colours. Actions are interactive-only, not agent/MCP execution grants. Clip lookup is against the active timeline, so a stale row cannot edit a different clip.

The old workspace, keyboard controls and legacy `VideoControls` remain intact. This migration does not add undo history, save a project format, change encoding, or replace timeline playback.

## Export

Export uses the existing mediabunny/WebCodecs session. Output choices follow actual encoder capabilities. MP4 without AAC is labelled as having no audio. Closed source tabs block export; reopen them first. Cancel uses the existing worker cancellation path. Export creates a copy and leaves source files unchanged.

## Verification

From `phase1/`:

```sh
npm ci --ignore-scripts
npm run inventory:ui-commands
npm run check:ui-commands
npm run check:layers
npm run check:commands
npx tsc --noEmit
npx tsx --test src/lib/video/*.test.ts src/lib/shell/*.test.ts src/lib/i18n*.test.ts
npx playwright install chromium
node scripts/video-shell-capture.mjs
```

The capture script mounts the production panels, inspector, styles and typed commands through `tests/harness/video-shell.html`. A deterministic probe seam supplies codec facts; it does not encode media. The script verifies title edits, duration, ordering, source display, clip trim and mute, and saves light/dark PNGs under `tests/artifacts/`. Its surrounding canvas and navigation are test scaffolding, not an app screenshot.

`tests/video-shell-ui.spec.ts` exercises the same flow in the full app. It requires the baseline craft, documents, sound and slides WASM bundles. This checkout cannot run that test until those bundles are built. Native window behavior and browser encoding are not verified by the isolated harness. The baseline typecheck also needs the missing slides-engine JavaScript/declaration bundle.

Validated in this change: 151 video, shell and locale tests pass; UI-command inventory and IPC-command checks pass. The layers check reports no new violations, with its existing TypeScript 7 transpiler warning. Typecheck reports only the missing baseline slides-engine bundle. The isolated harness passes and the four screenshots were inspected for readable labels, selection, trim, audio, export controls and light/dark layout. Full-app and native verification remain pending the engine bundles.
