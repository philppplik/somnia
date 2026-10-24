# AE2 - Advanced Export for Video Studio

The export panel and the "Review video export" dialog stay. AE2 adds the shared Advanced Export dialog as a second way into the same export.

- Command `video.export.advanced` ("Advanced export...") is listed first in the Export center's Video group. It is enabled for a ready timeline with clips.
- Fields: format (only the encoders this browser has), file name, resolution (100/50/25%), aspect ratio, frame-rate cap, quality, an optional export range (start/end in seconds), and the "export without sound" confirmation when the timeline has audible audio but the format has no audio encoder here. That confirmation is required in the dialog, like the review dialog's silent-output check.
- The dialog starts from the session's current options. On Export it writes the same session fields the panel edits (`setVideoFormat`, `setVideoExportOptions`, `setVideoExportRange`) and then runs the normal `exportVideoFile`, so the panel shows the same values afterwards and the project file stores them.
- The chosen file name is used for the download (`exportVideoFile(name, fileName)`). Without a name argument the old `-copy` / `-edited` names are unchanged.
- Progress shows in the dialog; while encoding the footer button becomes "Stop export" (`cancelVideoExport`). The dialog closes on a finished download and stays open with the error when encoding fails.
- There is no preview or size estimate: the encoded size is only known after encoding. Presets are the shared local presets (`somnia.export.presets.video`). The dialog closes if another file becomes active.
- Shared dialog change: optional `progress` and `onStop` props. No new dependency or permission.
