# AE2 - Advanced Export for Animation Studio

One dialog over the Render setup exports: current frame (PNG, JPEG, WebP), PNG sequence, GIF, APNG, WebM and sprite sheet. The existing commands, the Render setup panel, the render queue and presets are unchanged.

- Command `animation.export.advanced` ("Advanced export...") is listed first in the Export center's Animation group. It is enabled while an animation is open.
- Fields by output: file name and scale (all); frame rate (not stills); WebM quality; JPEG/WebP quality; transparent background (PNG, WebP, sequence, APNG, sprite sheet); GIF colours and dithering; loop and "drop the duplicate last frame" (GIF, APNG); sprite sheet columns and padding; selected layers only; frame range (not stills).
- The dialog adds no export logic. It writes the same session settings the panel edits (`setExportSettings`, `setExportTransparent`), then runs the matching `exportCurrentFrame`, `exportWorkAreaSequence`, `exportGif`, `exportApng`, `exportWebM` or `exportSpriteSheet`. It starts from the panel's current settings, and what you set carries back to the panel. Crop, background, motion blur and first frame number stay as the panel has them.
- Validation uses the existing `settingsProblems` and `exportPlan` limits (size, frame count, GIF 300 frames, WebM 60 s, range inside the composition). Name required; selected-only needs a selected layer.
- Progress and Stop use the export job's own progress and cancel.
- No preview or size estimate in the dialog: the panel still shows the plan and the byte estimate. Lottie, SVG and clipboard copy stay on their own commands.
