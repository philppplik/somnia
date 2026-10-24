# Sound output ranges (C3)

Status: implementation slice, headless-tested. No new dependency. Recording, codecs and Stage-D scope stay out.

## What changed

Render and export can target an explicit output range instead of always the full session. The range select in the Arrange transport offers the full session, the loop region and each consecutive marker pair, with the exact duration in the label. The chosen frames go through the identical racked mix pipeline, so a range render is bit-identical to the matching slice of a full render (covered by tests). The audition player, analysis and export all use the same rendered range WAV.

The range is a view choice, not session data: it is not undoable, does not dirty the session JSON and is not persisted. Export requires the rendered range to match the current selection, so changing the selection after rendering blocks export until the range is rendered. Ranges never receive the C1 effect tail: the output is exactly the requested frames. Mastering (B3) renders the full session by contract and is explicitly blocked while a range is selected.

## Honest limits

- Range bounds are whole frames within the session; stale selections after marker/session edits fail validation with a clear error at render time, not a silent clamp.
- No per-clip export, stems or multi-range batch export.
- The browser/natives save path and labels are unchanged: saved, download started, cancelled or failed.

Roadmap-Delta C3: marker/loop-bounded output ranges through the existing racked pipeline with an export guard tying output to the selected range. No new DSP, dependencies or Stage-D scope.
