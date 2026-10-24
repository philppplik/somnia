# Sound Studio

Status: check the release notes of your version. The hero action state is in [Hero actions](../hero-actions.md).

## Opens

mp3, wav, flac, ogg/oga, aif/aiff. The type is detected from content, not the extension.

## Blank start

One second of silent stereo WAV (48 kHz, PCM16). It is a buffer, not a multitrack session. Blank documents live in memory until you save them.

## Rail and panels

Files, Audio clips, Selection, Effects, plus an Audio inspector.

## Header action

Export audio.... Opens a short review of the processed WAV before saving.

## Export and save

WAV copy. Playback and export use the same rendered audio.

## Limits

- Original files are never modified. Every edit renders a copy.
- Audio is processed in a worker, never on the UI thread.
- Edits: selection, trim silence, reverse, pitch, effect with reverb tail, fades, normalize, reset.

## Technical docs

- [Sound](../../studios/sound.md)
- [Sound shell](../../studios/sound-shell.md)
- [Hero action concept](../../concepts/hero-action-sound.md)

Back to [Studios](../studios.md).
