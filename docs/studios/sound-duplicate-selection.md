# Sound - Duplicate selection (Stage K1)

Ctrl/Cmd+D duplicates every selected clip right after itself.

## What it does

- Command `clips.duplicate` copies each selected clip with a fresh id, placed at its own end - the batch equivalent of the single-clip duplicate button. Name, gain, fades, curve, mute, pan and fade shape all carry over.
- One atomic, undoable edit; an unknown id rejects the batch unchanged.
- Keyboard: Ctrl/Cmd+D behind the existing focus guard (also prevents the browser bookmark dialog).

## Files

- `src/lib/sound/arrangeCommands.ts` - the command.
- `src/components/sound/SoundArrange.tsx` - the shortcut.
- `src/locales/sound/*.json` - command keys in all 5 locales.

## Test

- `arrangeCommands.test.ts` - placement and inheritance across tracks, fresh ids, atomic rejection, undo.
