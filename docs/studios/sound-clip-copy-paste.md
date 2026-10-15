# Sound - Clip copy/paste (Stage G3)

Clips can be copied to an internal clipboard and pasted at the playhead.

## What it does

- New commands `sound.arrange.clip.copy {id}` and `sound.arrange.clip.paste {frame, trackId?}`. The clipboard is one slot, session-wide, and survives pasting (paste as often as you like).
- Paste creates a fresh clip id, keeps every clip setting (gain, fades, curve, mute, pan, shape) and targets the original track unless `trackId` overrides it; unknown targets and an empty clipboard fail atomically.
- The selected-clip action row gained a Copy button; the transport row a Paste button that inserts at the playhead (disabled while the clipboard is empty).

## Files

- `src/lib/sound/arrangeCommands.ts` - clipboard slot, `clip.copy`, `clip.paste`, `hasClipClipboard`.
- `src/components/sound/SoundArrange.tsx` - buttons.
- `src/locales/sound/*.json` - command, catalog and label/hint keys in all 5 locales.

## Test

- `arrangeCommands.test.ts` - empty-clipboard rejection, paste geometry and settings, fresh ids, repeated paste, undo.
