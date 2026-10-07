# Image editor filters

Six version-1 operation handlers use the `image-editor` core `ImageOperation` and `OperationHandler` contracts. Call `registerFilterOps(registry)` from `src/lib/imageedit/filters` when composing the editor registry; its return value removes only the registrations it owns. Registration is transactional on conflicts. This feature does not change the core default registry or mount a second editor shell.

Use `newFilterOperation(id, type, params)` to create serializable operations and `patchFilterOperation(op, patch)` to replace parameters without mutating snapshots. Supported operation types: `blur`, `sharpen`, `grayscale`, `sepia`, `invert`, `vignette`. All are same-sized CPU operations. Optional GPU shaders are deliberately omitted.

| Parameter | Range | Default | Meaning |
| --- | --- | --- | --- |
| `strength` | 0..1 | 1 | 0 is an exact cloned identity |
| `sigma` (blur) | 0..100 | 10 | Gaussian sigma in source pixels at full strength; effective sigma = sigma * strength |
| `sigma` (sharpen) | 0..100 | 1 | Unsharp mask Gaussian sigma in source pixels |
| `threshold` (sharpen) | 0..255 | 0 | Minimum channel difference in unsharp mask |

Sharpen amount is `2 * strength`. Grayscale interpolates using the existing Rec.709 saturation kernel. Sepia uses the existing partial sepia matrix. Invert blends RGB with its inverse; strength 0.5 produces neutral mid-grey. Vignette smoothly darkens an ellipse outside the center quarter-radius, reaching `1 - strength` brightness at corners. Vignette handles 1-pixel axes without dividing by zero. All color filters and sharpening preserve source alpha. Blur filters RGB in premultiplied-alpha space with two separable Gaussian passes and returns straight-alpha sRGB; transparent hidden colors do not bleed into visible edges.

All existing pixel kernels are reused from `src/lib/image`; only shared RGB mixing and vignette kernels are added there. The existing Gaussian kernel now rejects nonfinite/negative/over-limit sigma and accepts an optional cancellation signal, checked per scanline. Unsharp mask also accepts this signal. This changes blur behavior at transparent edges intentionally, not for opaque inputs.

`FilterPanel` in `src/components/imageedit` displays one localized strength slider for the selected operation. `onChange` receives full immutable operations for preview; `onCommit` fires once per completed pointer/keyboard gesture, blur, or reset. Labels exist for en/de/es/fr/pt-BR. Host wiring: select a filter operation, render the panel, update the document via core `updateOperation`, and push history on commit. Sigma/threshold are exposed in the operation API, not as extra UI sliders.

No new dependencies or third-party source were added. New code is covered by the repository MIT license.

## Checks

- `npx tsx --test src/lib/image/*.test.ts src/lib/image-editor/*.test.ts src/lib/imageedit/filters/*.test.ts src/components/imageedit/FilterPanel.test.tsx`: 33 passed.
- `npx tsc --noEmit`: passed.
- `npm run test:core`: 1,162 passed, 3 skipped, 0 failed (1,165 tests).
- Local headless Chrome: inspected all six rendered 65% previews and sliders. Keyboard change committed current 0.99 once; blur did not duplicate; reset committed 0 once and disabled reset.

Remaining limitations: no GPU acceleration; large images with high sigma are CPU-heavy. Same-thread signals cannot process new DOM events until synchronous work returns, despite cooperative per-scanline checks. Host integration and end-to-end testing in the mounted editor shell remain the integrating builder's responsibility.
