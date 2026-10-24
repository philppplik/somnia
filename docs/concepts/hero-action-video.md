# Video Studio hero action: Export video...

Status: proposal for Philipp's design review. No implementation approved or included.
Research date: 2026-10-13. Code baseline: `int/shell`, `e2a188d3`.

## Recommendation and evidence

Use **Export video...** beside Account. It opens a small output review for the active timeline. This is more useful than website Publish and more honest than "Quick Export" while Somnia has no full preset system.

Adobe Premiere's Quick Export is explicitly at the top right. Its UI asks for file name, output location and preset before exporting. This is the clearest direct comparator for the requested header position:
https://www.adobe.com/in/learn/premiere-pro/web/quick-export-share-video (2026-02-25).

ProVideo Coalition independently describes the upper-right button and destination/preset flow, with advanced choices in the Preset Manager/full Export interface. The series is courtesy of Adobe, so this is corroborating specialist tutorial evidence, not an unsponsored usability study:
https://www.provideocoalition.com/tool-tip-tuesday-for-adobe-premiere-quick-export/ (2026-08-18).

Copy the short review path, not Premiere's codec/preset promises or branding. Playback, cut and title creation remain near the timeline and in their existing panels.

## UX

1. One stable button in the current hero position. It opens setup; no encoding or download begins on the first click.
2. Show timeline name, full-timeline duration, format and audio capability. V1 exports the whole timeline. Selected clip and playhead position must not silently become an output range.
3. Reuse current WebM/MP4 choices and capability probes. Prefer a supported audio-capable format; do not assume MP4 includes audio. Current UI already labels MP4 without AAC as lacking audio. Surface that warning before final submit and require deliberate selection of silent output when the timeline has audible content.
4. Do not promise H.264, AAC, social presets, 4K, frame-rate conversion or selectable resolution merely because Premiere has them. Only expose settings the current engine really owns.
5. Missing source media, loading/error state, empty timeline or unavailable encoder blocks final Export. Show a useful reason, not only a grey button. Setup may remain readable when encoding is unavailable.
6. Final Export dispatches the existing command. Current `exportVideoFile` encodes then triggers a browser download, including the frontend's current desktop path. No native destination chooser is established by this command. Say "Download started" rather than "Saved to [folder]" unless a future verified save flow provides that outcome.
7. During encoding keep the hero label "Exporting..." and allow opening the same progress view. Show progress and a separate labeled Cancel action using the existing cancel command. Do not make the entire header button silently turn into a destructive cancel target.
8. Closing progress does not cancel or start another render. Completion shows the actual report's duration, size and codecs. Failure preserves timeline and settings. Export does not mark the timeline saved.

The review must be keyed to the active timeline and refreshed after edits. Switching projects while a review is open invalidates its target; final submit must never export whichever project happens to be active without showing it again.

## Existing Commands and missing glue

| Existing command | Use |
| --- | --- |
| `video.export.format {format: "webm" | "mp4"}` | Explicit format choice, already capability-checked |
| `video.export.start` | Final submit only; starts encode and download |
| `video.export.cancel` | Explicit cancellation while exporting |

Add UI-only `video.export.open` to open/focus output review/progress. It does not exist today. Reuse the current session/controller and `VideoExportSection` controls, not a parallel encoder/export state machine. Review reopening during export should not require `video.export.start` to be enabled.

Grounding: `phase1/src/lib/video/commands.ts`, `phase1/src/lib/video/session.ts`, `phase1/src/components/video/VideoPanels.tsx`, `phase1/src/lib/studios/video.ts`, `docs/studios/video-shell.md`. `VideoExportSection` already provides capability-gated format radios, missing-source checks, progress/cancel and report summary.

## Studio-agnostic shell contract and Publish

Today `StudioShellDef` has no hero slot. The shared owner must add one generically after review. Video contributes manifest data for command, translated label and registered glyph; the shell uses registry enablement and an adapter-provided status projection, without a Video branch or access to video bytes. Do not reinterpret `busy` alone as "exporting"; studios have different busy operations.

Keep `deploy.open` discoverable through shared Project > Publish and the palette, with existing `Mod+Shift+U` and all server/destination review gates. The explicit Code menu entry does not prove Video has the same entry; verify it during shared menu integration. Local media export never publishes/uploads. A constrained-width action overflow uses the same export command. Header geometry, menus, Studio pill and Account stay stable.

No new shortcut until the inventory is checked. Use five-locale labels, theme/radius tokens, keyboard focus restoration and accessible progress semantics. No new permission for agent/MCP execution is implied.

## Effort and acceptance

Rough estimate: 1-2 developer days after the shared header slot for review opener, reusable controls, capability/error/progress states and tests. New native save picking, preset engines and codec work are excluded. Shared slot/menu/overflow work is counted once by the shell owner.

Acceptance: setup writes nothing; final Export reuses the dispatcher; whole timeline is explicit; missing media blocks output; silent MP4 warning is visible and deliberate; duplicate starts are prevented; cancel uses the current owner; timeline switches cannot export an unreviewed target; actual completion codecs match the report; five locales and light/dark/narrow-width pixels checked; Publish reachable. Real codec/audio and native behavior require implementation-stage verification, not claimed here.

Roadmap-Delta: promote existing video export behind output review/progress. Social presets, range export, extra codecs and native destination picking remain separate scope.
