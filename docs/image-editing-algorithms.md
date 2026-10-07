# Image editing: algorithms, reference code, licences

Reference implementation: `phase1/src/lib/image/` (pure TypeScript, no dependencies, runs under `tsx --test`).
All code there is original, written from the published algorithms; third-party projects below are references only, nothing was copied.

## Operation to algorithm to reference

| Operation | Algorithm (implemented in) | Reference implementation | Licence |
|---|---|---|---|
| Brightness / contrast | Shift, then scale around mid grey; contrast>0 uses 1/(1-c) (`adjust.brightnessContrast`) | evanw/glfx.js `src/filters/adjust/brightnesscontrast.js` | MIT |
| Saturation | Lerp from Rec.709 luma (`adjust.saturation`) | pixijs/filters `ColorMatrixFilter`; W3C Filter Effects `saturate()` | MIT; W3C spec |
| Hue | 3x3 rotation about the grey axis (`adjust.hueRotateMatrix`, W3C `hueRotate` constants) | glfx.js `huesaturation.js`; pixijs ColorMatrixFilter.hue | MIT |
| Exposure | Scale in linear light, back to sRGB (`adjust.exposure`) | sRGB transfer function (IEC 61966-2-1) | spec |
| Levels | in/out black-white + gamma LUT (`adjust.levelsLut`) | Photoshop model; CamanJS `levels` plugin | BSD-3-Clause (CamanJS) |
| Curves | Fritsch-Carlson monotone cubic spline into a 256 LUT (`adjust.curveLut`) | glfx.js `curves.js` (Catmull-style spline, can overshoot); CamanJS `curves` | MIT / BSD-3 |
| Grayscale / sepia / invert | Luma weights, W3C sepia matrix, 255-x (`adjust.*`) | W3C Filter Effects; Photon `monochrome`/`sepia` | spec; Apache-2.0 (silvia-odwyer/photon) |
| Convolution (sharpen, edge, emboss) | Edge-clamped NxN kernel (`convolve.convolve`) | Photon `conv` module; jimp `convolution` | Apache-2.0; MIT (jimp-dev/jimp) |
| Gaussian blur | Separable, radius 3 sigma, O(w*h*r) (`convolve.gaussianBlur`) | pica `lib/mm_unsharp_mask` and blur path; StackBlur for approximate O(1) blur | MIT (nodeca/pica) |
| Unsharp mask | src + amount*(src-blur) with threshold (`convolve.unsharpMask`) | pica unsharp mask; glfx.js `unsharpmask.js` | MIT |
| Resize (Lanczos2/3, Catmull-Rom, Hamming, bilinear, box) | Separable, kernel stretched by 1/scale when downscaling, alpha-weighted (`resize.resize`) | nodeca/pica `lib/mm_resize/*` (filters, convolve, WASM/WebGL variants) | MIT |
| Crop / flip / rotate90 | Index remap (`transform.*`) | trivial | n/a |
| Arbitrary rotate | Inverse mapping + bilinear, premultiplied-alpha safe (`transform.rotate`) | Photon `transform`; fabric.js | Apache-2.0; MIT |

Licences were checked against each repository's LICENSE file / GitHub licence metadata on 2026-10-07:
pica MIT, glfx.js MIT, pixijs/filters MIT, jimp MIT, fabric.js MIT, CamanJS BSD-3-Clause, photon Apache-2.0.
Avoid: kornelski/dssim (AGPL-3.0). ImageMagick (own Apache-style licence) and libvips (LGPL) are native libs, not suitable to copy or bundle into the front end.
Repo paths above come from GitHub tree listings; confirm them before quoting line numbers.

## WebGL shader vs canvas pixel loop

Measured here (node, single thread, 3 MP RGBA, flat image, not a browser, indicative only):
saturation 31 ms, 3-point curves 18 ms, Gaussian sigma 4 750 ms, Lanczos3 to 1000x750 170 ms.

- Per-pixel colour adjustments (brightness, contrast, hue, saturation, LUTs, sepia, invert): trivial on CPU at preview size (<50 ms for 3 MP), but a slider drag at 60 fps on a 12-24 MP photo needs the GPU. One uber fragment shader plus a 256x1 LUT texture does the whole chain in one pass (`shaders.ts: ADJUST_FRAGMENT`).
- Blur and convolution: the cost grows with radius. GPU separable blur is orders of magnitude faster. Keep the CPU version as reference, for tests and export fallback.
- Lanczos resize: pica showed it is fine on CPU/WASM for export; GPU Lanczos needs multi-pass and care at downscale ratios. Use CPU for final export, GPU bilinear/mipmaps for the live zoomed preview.
- Limits of WebGL: max texture size (often 8192-16384), 8-bit precision between passes (banding after long chains, use RGBA16F/RGBA32F with `EXT_color_buffer_float` where available), context loss, and sRGB handling (textures upload as sRGB-encoded bytes, so linear-light ops must convert in the shader as `ADJUST_FRAGMENT` does for exposure).
- Tauri/WebView2/WKWebView/WebKitGTK all expose WebGL; WebGL2 is available on current versions, GLSL ES 1.00 shaders here work on both.

Recommended architecture: `RasterImage` + the edit stack (`pipeline.ts`, plain JSON ops) is the source of truth; the live preview renders the stack on the GPU with the shaders in `shaders.ts`; export and tests render with the CPU reference. Tile large images (e.g. 2048 px) to stay inside texture limits. Heavy CPU work (export, big blur) goes in a Web Worker.

## Known gaps / next steps

- GPU renderer class (context, FBOs, ping-pong) is not built yet; `shaders.ts` has the sources and uniform helpers. No browser GPU was available to test GLSL here, so the shaders are structurally checked only.
- Levels/curves are RGB LUTs in sRGB space (Photoshop default). No HSL/selective colour, no 16-bit.
- Blur has no tiling or worker; a 3 MP sigma-4 blur takes ~0.75 s on CPU. A 3-pass box-blur approximation would be ~5x faster if needed.
