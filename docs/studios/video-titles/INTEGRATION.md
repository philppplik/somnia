# Video Studio P3: title clips - integration notes

Base: `09e3a84` + P1 + P2. Everything here is new files under `phase1/src/lib/video/`, `phase1/src/components/video/` and `phase1/src/locales/video-titles/`. The core files (timeline.ts, pipeline.ts, session.ts, VideoWorkspace, VideoTimeline, VideoInspector, i18n.ts) are untouched in patch 1. Patch 2 ("reference integration") applies every touchpoint below as a working example and is covered by real-Chromium tests; take it, adapt it, or ignore it.

## Contract

A title clip is a `TimelineClip` with `kind:'title'`, `source:''`, `in_s:0`, `out_s` = duration (0.05 to 3600 s), `gain:1`, `muted:false` and
`title:{text,size,color,background}`. Optional extras with defaults: `font` (sans|serif|mono), `bold`, `italic`, `align`, `vAlign`, `fadeIn`, `fadeOut` (seconds, fade from/to black, default 0).
`size` is px on a 1080-line frame and scales with the real frame height (72 on a 720p export draws 48 px).

Exports from `titles.ts`: `isTitleClip`, `needsSourceFile`, `drawTitleCard(ctx,clip,w,h,t=0)`, `newTitleClip`, `sanitizeTitleClip`, `normalizeTitleClips`, `splitTitleClip`, `patchTitle`, `setTitleDuration`, `insertClip`, `insertIndexAfter`, `clipDisplayName`, `titleAlphaAt`, `sanitizeTitleSpec`.
`titleExport.ts`: `renderTitleSpan` (frames + silence, no mediabunny import), `framePlan`, `silencePlan`.
Components: `TitlePreview`, `useTitlePlayback`, `TitleInspector`, `TitleAddRow`.

## Touchpoints (all small)

1. **timeline.ts**
   - `TimelineClip`: add `kind?:'title'; title?:TitleSpec` (types from titles.ts; titles.ts only imports `MIN_CLIP_SECONDS`, `newClipId`, `timelineDuration` lazily, so the import cycle is safe).
   - `sanitizeClips`: first line of the map: `if(c.kind==='title'&&c.title)return[sanitizeTitleClip(c as TitleClip)];` (no source duration lookup).
   - `splitAt`: for a title clip use `splitTitleClip(clip, time-range.start)`; the generic in/out split would give the right half `in_s>0`, which breaks the title contract.
   - `setClipEdge`: ignore title clips (length is changed with `setTitleDuration`).
2. **session.ts**: `export` `editTimeline` (titleSession.ts uses it); in `runVideoExport` collect sources only for `clips.filter(needsSourceFile)`.
3. **pipeline.ts** (`exportTimeline`)
   - `names`: only `needsSourceFile` clips are opened/probed.
   - Output size: first clip that has a video probe, else 1280x720. fps likewise (fallback 30).
   - `anyAudio`: ignore title clips (`!isTitleClip(c)&&...`).
   - In the clip loop, before `inputs.get(c.source)!`: `if(isTitleClip(c)){await renderTitleSpan({clip:c,start:range.start,width:outW,height:outH,fps,ctx,checkCancel,addFrame:(t,d)=>videoSource.add(t,d),silenceFormat,addSilence:audioSource?s=>audioSource.add(new AudioSample({data:s.data,format:'f32',numberOfChannels:s.channels,sampleRate:s.rate,timestamp:s.timestamp})):undefined,onFrame});continue;}`
   - **Silence format**: pass the channels/sample rate of the first audible source clip's probe as `silenceFormat`. mediabunny rejects an audio source whose input layout changes ("Audio parameters must remain constant"); the `transform` only converts after that check. Real clips here are mono 48 kHz, so stereo silence broke the export before this was fixed.
   - Silence is only added when an audio track exists. Without audible clips there is no audio track and titles are video-only.
4. **VideoWorkspace**: title clips have no `<video>`.
   - `titleClip = entry && isTitleClip(entry.range.clip) ? entry.range.clip : null`; render `<TitlePreview clip time={playhead-entry.range.start} aspect label/>` instead of the `<video>`.
   - `missing` set: filter with `needsSourceFile` first.
   - `toggle`: for a title, flip `playingRef`/`playing` directly. `useTitlePlayback({running:!!titleClip&&playing, from:playhead, limit:entry.range.end, onTime:setPlayhead, onEnd:()=>advance(index)})` is the clock. An effect on `titleClip?.id` re-asserts `playing` when playback runs from a video clip into a title (the video's `pause` event clears it).
   - `step`: do not return early without a `<video>`.
5. **VideoTimeline**: label with `clipDisplayName(clip, shortName(source))`; `gone` only when `needsSourceFile`.
6. **VideoInspector**: `<TitleAddRow onAdd/>` (testid `video-add-title`) in the timeline panel; for a selected title clip render `<TitleInspector/>` instead of source/trim/gain/mute (move and delete stay). `titleSession.ts` has `addTitleClip` (inserts after the selected clip or at the end and selects it), `updateTitle`, `setTitleLength`.
7. **i18n.ts (video)**: merge `TITLE_CATALOGUES` into `VIDEO_CATALOGUES` per tag (`video.card.*` keys, five languages, parity tested).

## Test ids

`video-add-title`, `video-title-panel`, `video-title-text`, `video-title-duration`, `video-title-background`, `video-title-font-size`; extras `video-title-color`, `-font`, `-bold`, `-italic`, `-align`, `-valign`, `-fadein`, `-fadeout`; preview canvas `video-title-preview`.

## Behaviour notes

- Export draws frames at the output fps (a static card is drawn once and re-submitted). The last frame is shortened so the span ends exactly at `start+duration`. Silence is sample-exact (`round(duration*rate)` frames in 0.5 s chunks).
- Preview and export share `drawTitleCard`, so the preview is what renders.
- Fades go to/from black at the card edges. Cross-dissolves between a title and a video clip need compositing of two frames in the pipeline and are the lead's call; `titleAlphaAt` and `drawTitleCard(...,t)` give the card side.
- Muted video clips still leave their audio span empty; mediabunny pads interior gaps with silence but not a gap at the very end. A trailing muted clip would end the audio early (existing behaviour, not changed here). Title clips avoid this because they always add their own silence.
- Verified: `tsx --test` unit tests (`titles.test.ts`, 13) and `tests/video-titles.spec.ts` (3 real-Chromium tests that export and decode the result: card pixel colour in the title span, duration, audio track end within 0.4 s of video end).
