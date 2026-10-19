# AE2 - Advanced Export for Sound Studio

Sound Studio keeps its "Review audio export" dialog (`sound.export.open`) and the plain `sound.export` WAV copy. AE2 adds the shared Advanced Export dialog next to them.

- Command `sound.export.advanced` ("Advanced export...") opens the shared dialog for the active, fully rendered clip; it is listed first in the Export center's Sound group. It is disabled in the Arrange view and while an edit is still rendering, and the dialog closes if the clip changes underneath it.
- Fields: file name, bit depth (same as source, 16-bit PCM, 24-bit PCM, 32-bit float), channels (keep or mono mixdown), peak normalisation to a chosen level (-24 to 0 dB), and RIFF INFO tags (title, artist, copyright, comment; ASCII, other characters become `?`). Metadata is collapsed by default.
- All processing is deterministic and happens in `src/lib/sound/exportWav.ts` on the engine's rendered WAV. With neutral options the engine bytes are saved untouched. Sample-rate conversion is not offered (it needs the engine).
- The size line shows the exact final file size from the same render that is saved, plus duration, channels and sample rate. There is no image preview for audio, so `ExportPreview.url` is now optional and takes a `detail` string.
- Saving goes through the existing `audio_save_pick` / `audio_save_write` path (`saveSoundBlob`, factored out of `saveSound`); no new Tauri command or permission.
