# Sound Studio hero action: Export audio...

Status: proposal for Philipp's design review. No implementation approved or included.
Research date: 2026-10-13. Code baseline: `int/shell`, `e2a188d3`.

## Recommendation and why

Use **Export audio...** beside Account. It opens a compact output review before saving a WAV copy. Playback stays close to the waveform; effects stay in the inspector. Do not add Record as the hero while no recording command/workflow is available in the inspected Sound implementation.

### Product evidence

Audacity makes Play, Record and navigation prominent in its upper transport dock. Export is instead File > Export Audio, opening range, format, metadata and output controls. There is no evidence here for a top-right Audacity Export button. Somnia's smaller offline audio-editing workflow justifies promoting export without copying recording controls it cannot support.

- Transport toolbar: https://manual.audacityteam.org/man/transport_toolbar.html
- Export Audio dialog: https://manual.audacityteam.org/man/file_export_dialog.html

Audacity's many formats and mixdown capabilities are comparator behavior, not Somnia features.

## UX

1. One stable labeled action in the existing header slot, using a registered audio/export glyph. The ellipsis signals review, not an instant download.
2. Open an export sheet over the existing Sound workspace. Show active clip name, WAV output, rendered duration, channels and sample rate from the current processed report. Do not offer MP3/AAC, bitrate, stems or invented presets.
3. Describe scope as the current processed clip. A highlighted selection is not an export range by itself. If crop/cut/selection-only processing was committed through the existing region controls, show that recipe summary. Never apply a crop just because the user opened Export.
4. If auditioning Original, say "Export uses the edited audio" and offer Listen to edited via the existing command. `exportSound` uses processed bytes regardless of the audition toggle; do not let the UI suggest otherwise.
5. Final action: Export WAV. Reuse the native save picker/atomic write on desktop or browser download on web. Label outcomes honestly: saved, download started, cancelled or failed. A browser download does not prove a particular folder was written.
6. While decoding, queued debounce processing or rendering, show a reason and disable final export. Refresh output facts when processing finishes. No stale WAV may slip through immediately after a settings change.
7. Cancel closes review without writing or changing settings. Export does not clear editing/dirty state and does not overwrite source audio. Native picker cancellation is not an error.

For v1, keep export read-only until final submit. Adding configurable sample-rate conversion or output ranges would need new recipe/engine behavior, not merely a dropdown.

## Existing Commands and code ownership

| Existing command | Use |
| --- | --- |
| `sound.export` | Final submit only; saves/downloads current processed WAV |
| `sound.listen {version: "processed"}` | Optional edited-audio audition |
| `sound.transport.toggle` | Existing transport control, remains in the workspace |
| `sound.region.apply {mode}` | Existing deliberate editing flow, never invoked by opening export |

Add UI-only `sound.export.open` as a review-opening command. It does not exist yet. Keep `isSoundExportReady(activeSoundName())` authoritative at submit, including the pending timer guard. The reviewed clip identity and processed generation must still match at submit; switching clips or changing settings refreshes review or requires the user to reopen it. Do not implement a second render pipeline or export store in the header.

Grounding: `phase1/src/lib/sound/commands.ts`, `phase1/src/lib/sound/session.ts`, `phase1/src/lib/sound/recipe.ts`, `docs/studios/sound-shell.md`. Registration is reference-counted because Code inline preview and Sound can overlap; the new opener must retain that lifecycle without claiming Code's document as Sound's hero target.

## Studio-agnostic shell contract and Publish

The shared header hero slot is a proposed additive capability, not part of today's `StudioShellDef`. Sound supplies command/label/icon data only. Generic shell rendering and the command registry own availability; Sound session logic and review UI stay in the adapter. No studio-ID branch, no component import into the data manifest and no widened agent/MCP grant.

Retain `deploy.open` in the shared Project > Publish entry and palette with `Mod+Shift+U`, respecting its availability and destination-review rules. Check cross-studio menu discoverability during shared integration: today's Code manifest explicitly lists it, which alone does not prove Sound's menu contains it. Export WAV is local output, not upload/publication. Do not add cloud sharing to this concept.

When horizontal space is scarce, the generic hero overflow exposes the same command and label. Keep Studio pill, menus and Account stable. Do not introduce a shortcut without an inventory conflict check. Review is keyboard accessible, restores focus on close, and uses existing theme/radius tokens and five-locale strings.

## Effort and acceptance

Rough estimate: 1-2 developer days after the shared header slot, for the opener, read-only review UI, outcome handling and tests. Excludes recording, codecs, resampling and cloud sharing. Shared header/menu/overflow effort is counted once elsewhere.

Acceptance: final WAV equals current processed bytes; original audition is clearly distinguished; selection alone changes no export scope; queued timer and processing states block stale exports; clip switches cannot save an unreviewed clip; native cancel and web download outcomes are distinct; all five locales and light/dark/narrow-width screenshots checked; Publish remains reachable. Real audio and native picker tests are required during implementation, not claimed by this document.

Roadmap-Delta: promote existing WAV export behind a lightweight output review. Recording, MP3/AAC, mixdown/stems and export-range editing remain separate work.
