# Sound - Group mute (Stage H4)

The M key toggles mute on the whole selection.

## What it does

- With clips selected, pressing M mutes them if any is unmuted, otherwise unmutes all - one undoable edit for multi-selections (new command `clips.mute`), the existing `clip.set` for a single clip.
- The same focus guard as the other shortcuts applies, and the handler re-registers on every document revision so it never reads a stale arrangement.

## Files

- `src/lib/sound/arrangeCommands.ts` - `clips.mute`.
- `src/components/sound/SoundArrange.tsx` - key handling.
- `src/locales/sound/*.json` - command and catalog keys in all 5 locales.

## Test

- `arrangeCommands.test.ts` - toggle, atomic rejection, undo.
