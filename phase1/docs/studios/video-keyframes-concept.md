# Video Studio - keyframes concept (no code yet)

Written after the V17-V42 slice run (overlays, PiP, transitions, reverse, subtitle import/styling, aspect
presets, title animations). This is a design concept for animated properties over time. Nothing here is
committed behavior; the first implementation slice needs its own go.

## Why keyframes, and which ones first

Everyday expectations this unlocks, ranked by value:

1. **Ken Burns on image clips** (crop rect moves slowly across a still) - the single most missed everyday
   effect for photo videos. Image clips already carry a crop; animating it is the natural next step.
2. **Moving PiP / overlay rect** - a PiP that slides in, parks in a corner, leaves. Overlay clips already
   carry rect + opacity; animating both covers the social-video grammar (pop-ins, lower thirds that rise).
3. **Overlay opacity** - fade a watermark or title overlay in/out without splitting it.
4. **Clip gain** - volume ramps on the video track without splitting clips (audio track already has fades,
   not ramps).

Out of scope on purpose: rotation/flip animation (quarter turns are a fix, not an effect), speed ramping
(time remapping is a different, much larger feature), effect filters.

## Data model

Option A (recommended): one optional key list per animated property, stored on the clip it belongs to.

```ts
interface Key<T>{t:number;v:T}                    // t in clip-local seconds, ascending
interface OverlayClip{
  // ...existing fields...
  rectKeys?:Key<OverlayRect>[];                   // absent = static rect (today's behavior)
  opacityKeys?:Key<number>[];
}
interface TimelineClip{
  // ...existing fields...
  cropKeys?:Key<ClipCrop>[];                      // Ken Burns for image clips
  gainKeys?:Key<number>[];
}
```

Why per-property lists (A) and not one shared key array of partial states (B): A keeps every existing
sanitizer shape (each field already has its own validator: cropOf, opacity clamp, rect sanitize), keeps
keys independent (a crop move does not force gain keys), and matches how the studio already stores fades
and transitions. B reads nicer for "pose" workflows but couples unrelated properties and complicates
sanitize + undo coalescing.

Time base: **clip-local seconds**, not timeline seconds. Keys then travel with the overlay when it is
dragged on the lane (moveOverlayClip), and split/trim of a clip re-bases keys exactly like in_s does.
Trimming an overlay start shifts keys by the trim amount; keys outside the new range are clamped away in
sanitize, same discipline as fadeIn/fadeOut.

## Evaluation

One pure, shared helper, same pattern as `transitionVisual` (V41):

```ts
valueAt<T>(keys:Key<T>[],t:number,lerp:(a:T,b:number,c:T)=>T,fallback:T):T
```

- Interpolation: linear + smoothstep (one curve parameter `e?:'linear'|'smooth'` per key is enough; hold
  steps are expressed as two keys with the same value - no third mode needed).
- Outside the key range the value holds (first/last key wins). Absent list = the static field, so every
  existing project behaves identically (migration-free).
- Evaluation cost per frame is a binary search plus one lerp - trivial against decode/encode.

Integration points (all existing single paths, verified in code):

- **Export**: drawOverlays evaluates rect/opacity keys at frame time t before the blit; sideFrame/cropFrame
  evaluates crop keys; emitZoneAudio's gainAt already takes a function of t, gain keys just feed it.
- **Preview**: the overlay render in VideoWorkspace evaluates at the playhead; the image-clip crop path
  (applyPreviewTransform) already takes a crop - animated crop is one more caller of the same math.
- No new render architecture anywhere; this is why the concept stays cheap.

## Model hygiene (the house rules applied)

- sanitizeOverlayClips/sanitizeClips: validate keys (finite t ascending, values through the existing
  per-field validators), drop empty lists, re-base on trim/move.
- sameClips is a field list: every key list must be added (JSON compare is fine, keys are small).
  sameOverlays is a JSON full-compare, so overlays auto-cover new fields.
- clipsSignature must include the key lists or dirty tracking misses pure-key edits.
- Project file: bump to version 3, keep VIDEO_PROJECT_READ_VERSIONS=[1,2,3]; absent keys parse as static.
- Undo: key drags coalesce under a historyKey, same as trim/gain gestures.

## UI concept

Phase 1 (minimal, honest): a "set key at playhead" toggle per animatable property in the inspector, plus
key markers (diamonds) on the overlay lane / clip strip at key times; clicking a marker seeks, delete via
inspector. The canvas drag of an overlay (existing rect drag) writes/moves a key when keys exist, stays
static otherwise.

Phase 2 (only if asked): a collapsible curve lane under the timeline with draggable key diamonds and
value readout. No bezier handles, no graph editor - smoothstep covers the everyday 95%.

## Phasing proposal (each its own slice)

- K1: model + sanitize + signature + project v3 + valueAt + overlay rect/opacity keys in export & preview
  + inspector key toggle. ~10-14 unit tests on the pure math and model rules.
- K2: Ken Burns: cropKeys on image clips + one-click "Ken Burns" preset (two keys, slow zoom-in) in the
  image inspector.
- K3: gainKeys on media clips through emitZoneAudio's gainAt, inspector toggle, preview volume follows.
- K4 (optional): curve lane UI.

## Risks and honest notes

- The concept is cheap precisely because every property already has exactly one render path and one
  validator. If a future feature adds a second render path, key evaluation must not fork with it.
- Preview-while-dragging re-renders overlays per pointer move already today; key evaluation adds nothing
  measurable.
- Reversed clips (V42) evaluate keys on the clip-local clock, so a reversed clip's overlay animation is
  not reversed - keys live on the overlay, not the source footage. This reads correct in practice.
- No backwards-audio, no time remapping: keys never change which source frame shows, only how it is drawn.
