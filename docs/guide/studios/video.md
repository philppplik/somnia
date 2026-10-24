# Video Studio

Status: check the release notes of your version. The hero action state is in [Hero actions](../hero-actions.md).

## Opens

mp4, m4v, mov, webm, mkv. The type is detected from content.

## Blank start

Empty edit list. Add source clips, edit, then export. Blank documents live in memory until you save them.

## Rail and panels

Files, Sources, Sequence, plus a Video inspector.

## Header action

Export video.... Opens a short output review for the active timeline.

## Export and save

Download as WebM (baseline) or MP4 (only where the platform can encode H.264). Where no AAC encoder exists, MP4 exports video-only and says so.

## Limits

- Multi-clip timeline: split, ripple delete, reorder, trim, per-clip gain and mute. Keys: Space, arrows, I/O, S, Delete, Alt+arrows, M.
- Original files are never touched.
- Encoding uses the platform (WebCodecs). There is no bundled ffmpeg.

## Technical docs

- [Video](../../studios/video.md)
- [Plan and technology choices](../../studios/VIDEO-PLAN.md)
- [Video titles](../../studios/video-titles)
- [Video shell](../../studios/video-shell.md)
- [Hero action concept](../../concepts/hero-action-video.md)

Back to [Studios](../studios.md).
