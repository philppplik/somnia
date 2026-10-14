# Native C++ libraries in Somnia: where it makes sense

Status: concept/research only. No implementation, no build or runtime validation.
Research date: 2026-10-14.
Source baseline: `int/shell`, `c3922d01671178cad68ed95b7422bca7215f9319`.
Question: can Somnia integrate C++ for tools and engines (creative software, video/audio, CAD, animation, image editing, performant desktop, local AI)?

## Decision

Somnia writes **no C++ of its own**. Its own engines stay Rust (native, or Rust compiled to WASM), as in `phase1/craft` and the other `*-craft` crates. Mature C/C++ libraries are used only where they replace years of work and the license allows it, in one of three ways:

1. **Use**: link through a maintained Rust binding or a small C API wrapper, built from source in CI, statically linked, inside the signed app.
2. **Sidecar**: ship a separate signed binary next to the app (Tauri `externalBin`) and talk over stdio or loopback. Used when a library is heavy, crash-prone, GPU-hungry or has a license that must not touch the app binary.
3. **Avoid**: GPL/AGPL/non-commercial code, or code with a Rust alternative that is good enough.

Reason in one line: C++ is an ingredient, not a language choice. The cost is not writing it, it is building, signing, patching and sandboxing it on three operating systems with $0 CI budget.

Evidence labels: **Verified** = license file or README read on 2026-10-14 (sources below). **Proposed** = design choice. **Unverified** = not built or measured on Somnia, no Windows/Mac hardware here.

## 1. Current state in the repo (Verified)

- Engines are Rust crates compiled to WASM (`phase1/craft`, `sheets-craft`, `pdf-craft`, `photos-engine`, `slides-engine`, raster WASM, sound). `npm run craft:build` chains them (`phase1/package.json`).
- The desktop host is Tauri 2 with Rust (`phase1/src-tauri/Cargo.toml`); there is already one sidecar pattern (the Node agent engine of the CLI, `docs/cli/protocol.md`).
- Video decision: OS codecs via WebCodecs, no bundled ffmpeg; `ffmpeg.wasm` was rejected because `@ffmpeg/core` is GPL-2.0-or-later (`docs/studios/video.md`, `VIDEO-PLAN.md`). This concept keeps that decision.
- Existing concepts already choose `whisper.cpp` (STT) and `sherpa-onnx` (TTS) as native helpers, and Ollama as the local LLM runtime: `docs/concepts/local-voice-models.md`, `local-models-ollama-runtime.md`. This document does not reopen them; it adds the general rules and the other libraries.
- CI is GitHub Actions on a public repo (ubuntu, windows, macos runners in `docs/BUILD-AND-RELEASE.md`). Standard hosted runners are free for public repositories [S12]. Adding C++ builds costs wall-clock time, not money, as long as the repo stays public and builds stay on standard runners.

## 2. Rules that decide every library

| Question | Rule |
| --- | --- |
| License | MIT, BSD, Apache-2.0, zlib, ISC: use. LGPL-2.1: allowed only as a **dynamically linked, replaceable** library or sidecar, with source offer, notice in Settings > Licenses and no GPL parts compiled in. GPL/AGPL/CC-BY-NC, "nonfree": avoid. Somnia is MIT; static linking LGPL code into the signed app binary makes user relinking hard and is not recommended. This is an engineering reading, not legal advice; the owner should confirm LGPL handling once. |
| Patents/codecs | A software license does not cover patents. H.264, HEVC, AAC and others carry patent pools; FFmpeg states it cannot give patent clearance [S5]. Prefer royalty-free formats in bundled code (AV1, VP9, Opus, Vorbis, FLAC, WAV) and OS codecs for patented ones. |
| Build | Needs a reproducible build with pinned source revision, no system packages on the user machine, and builds on windows-latest, macos-latest, ubuntu in the existing matrix. Anything that needs CMake + vcpkg + several hours or a GPU SDK on every run is a sidecar candidate or a "download on demand" module. |
| WASM vs native | WASM (browser sandbox, no GPU compute beyond WebGPU, memory cap, no threads without COOP/COEP) for editing engines that must also run on the web. Native for GPU compute (Metal, CUDA, Vulkan), large models and file-system-heavy work. whisper.cpp itself lists a WebAssembly example and Metal/Core ML/Vulkan/OpenVINO backends [S2]. |
| Signing | Every executable in the bundle must be signed. macOS builds are ad-hoc signed today (no Developer ID, `somnia-windows-distribution`, Gatekeeper warning); Windows is unsigned outside the MS Store MSIX. More binaries means more SmartScreen/Gatekeeper surface and, in the MS Store, more review. This is a reason to keep the **number of bundled native binaries small**; downloading a helper after install needs a pinned digest and signature check (Proposed). |
| Security | Parsers of untrusted media are the classic memory-safety attack surface (image/video/font/CAD). Run them in a **sidecar with no network, restricted file access and a timeout**, never in the main app process. Existing broker and capability rules (`cap-std`, MCP broker) are the model. |
| Size | Installer size is a user-visible cost. Models are never bundled (download with digest, as in the local-voice concept). Large libraries (OpenCV full, OCCT, Qt) are optional downloadable modules, not base installer content. |
| Alternatives | Pure Rust first when it is mature enough: it builds with plain `cargo`, fits the WASM path and needs no extra signing. |

## 3. Recommendation per library

Legend: **Use** (link, static, built in CI), **Sidecar**, **Module** (optional download, then Use/Sidecar), **Avoid**.

### Local AI and tensor acceleration

| Library | License (Verified) | Verdict | Notes |
| --- | --- | --- | --- |
| whisper.cpp | MIT [S2] | **Sidecar** (already proposed) | Native Metal/Core ML/Vulkan/CUDA/OpenVINO builds; a crash or OOM must not kill the editor. Rust binding `whisper-rs` is public-domain licensed (Unlicense) but its home moved to Codeberg [S3]; pin a revision or write a thin C API wrapper. Models downloaded, not bundled. |
| llama.cpp / ggml | MIT [S1] | **Sidecar or Ollama** | Today Ollama (a separate app) already covers local LLMs. Bundling llama.cpp (`llama-server` as sidecar, GGUF models) is the path for users without Ollama; keep the same RuntimeAdapter contract. Do not link it into the app process: model loading is multi-GB and failure-prone. Rust binding `llama-cpp-2` exists [S4], still a thin wrapper that tracks upstream closely, so pin. |
| ONNX Runtime | MIT [S6] | **Use (Rust `ort`) or Sidecar** | Best general path for non-LLM models (segmentation, upscaling, embeddings, TTS via sherpa-onnx). `ort` (pyke) is MIT/Apache [S7]. Execution providers: CoreML, DirectML, CUDA, each adds download size; ship CPU + platform provider only. The repo already has an optional fastembed/ONNX feature (`vibespace-fastembed`). |
| ncnn | BSD-3 (Tencent) [S8] | **Module** | Vulkan inference for mobile-class vision models (upscalers like Real-ESRGAN ncnn builds). Useful for Photos "upscale", small and vendor-neutral on GPU. Only if ONNX Runtime does not cover the model. |
| Candle (Rust, HF) | MIT/Apache [S9] | **Use as the pure-Rust option** | Fewer features and speed than ggml on CPU/Metal for LLMs, but no C++ toolchain, and compiles to WASM. Good for small models in-process. Revisit per model. |
| MLC LLM / TVM | Apache-2.0 [S10] | **Avoid for now** | Powerful (WebGPU, compiled models) but heavy compiler toolchain and per-model compile step; too much build complexity for a $0 pipeline. |
| XNNPACK | BSD [S11] | **Avoid directly** | Comes inside ONNX Runtime/TFLite; no reason to integrate separately. |
| CUDA/cuDNN, TensorRT | NVIDIA proprietary | **Avoid bundling** | Redistribution rules and size. If a user has CUDA, helpers detect it; Somnia does not ship it. |

"Tensor acceleration" in practice means: Metal (macOS), CUDA/Vulkan (Windows/Linux), DirectML (Windows) selected by the helper, not by Somnia code. The honest limit: GPU paths are **Unverified** here and need real Windows and Mac hardware tests (owner tests on Windows, Surface, Mac).

### Video and audio

| Library | License (Verified) | Verdict | Notes |
| --- | --- | --- | --- |
| FFmpeg (libav*) | LGPL-2.1+ by default; GPL if `--enable-gpl` (libx264, libx265); `--enable-nonfree` not redistributable [S5] | **Sidecar, LGPL-only build, optional module** | Keeps the earlier call "ffmpeg only as system tool, not bundled". Options in order: (1) use a system ffmpeg if found (today's decision); (2) optional download of an LGPL-only build with a pinned digest; (3) never bundle a GPL build. LGPL builds have no x264/x265, so H.264/HEVC encode must come from OS encoders (VideoToolbox, Media Foundation, WebCodecs) and patent exposure stays with the OS vendor. Native codecs-in-Rust (`rav1e` BSD-2 [S13], Symphonia for audio decode) cover royalty-free formats. |
| GStreamer | LGPL-2.1 | **Avoid** | Plugin system and per-OS runtime are hard to ship and sign; no gain over FFmpeg sidecar. (License from project docs, not re-fetched; Unverified.) |
| MLT | LGPL-2.1 core [S14] (some modules GPL) | **Avoid as core** | Mature NLE engine (Shotcut, Kdenlive), but its build/plugin tree mixes GPL modules and its C API is a large surface. Timeline model stays Somnia's own Rust/TS. |
| libmpv / mpv | LGPL-2.1+ (GPL if built with GPL parts) | **Avoid** | Not needed: preview is WebView video/WebCodecs. |
| Symphonia, cpal, rodio (Rust) | MPL/Apache/MIT | **Use (Rust)** | Pure-Rust audio decode and device I/O; best default for the Sound studio. Check each crate's license at integration time (Unverified). |
| PortAudio | MIT-style [S15] | **Avoid** | `cpal` does the same without C. |
| Opus/libopus, FLAC, Vorbis | BSD | **Use (small C libs)** | Tiny, permissive, trivial to build. Already the shape of the LGPL mp3 module decision; prefer these over LAME where the format allows. |

### Image and photo editing

| Library | License (Verified) | Verdict | Notes |
| --- | --- | --- | --- |
| OpenCV | Apache-2.0 [S16] | **Module (sidecar)** | Useful for magic-wand, inpainting, feature matching, stabilisation. Full library is large; use `opencv-rust` bindings (needs system OpenCV, awkward on Windows) or a **minimal custom build** of a few modules, or use OpenCV.js for web. Prefer Rust `image`/`imageproc` and the existing photos engine first; add OpenCV only for a named feature that Rust lacks. |
| libvips | LGPL-2.1+ [S17] | **Sidecar or Avoid** | Fast large-image pipeline, but LGPL and many transitive libs. Photos already has Rust engines; avoid unless profiling shows a gap. |
| ImageMagick | ImageMagick License (permissive, Apache-like) [S18] | **Avoid** | Large attack surface and delegate libs (some GPL). Not needed. |
| Skia | BSD-3 [S19] | **Avoid direct** | The WebView already uses Skia/Chromium internals; native Skia in the Rust app (`skia-safe`) is a very heavy build. Use `vello`/`wgpu` (MIT/Apache [S20]) for Rust-native 2D if needed. |
| OpenColorIO / OpenEXR | BSD-3 [S21, S22] | **Module** | Needed for pro colour pipelines and EXR/HDR in Photos and Video. Both build with CMake, are permissive. Add only when the Photos roadmap names HDR/ACES workflows. |
| LibRaw / dcraw-like RAW decode | LGPL-2.1 / CDDL (Unverified) | **Sidecar** | RAW development is "not established" in the repo (`docs/guide/studios.md`). If added, isolate in a sidecar; Rust `rawloader` is the pure-Rust alternative (Unverified). |
| zimg | WTFPL [S23] | **Avoid** | License is non-standard for lawyers; use Rust resize crates. |

### 3D, CAD, animation, physics

| Library | License (Verified) | Verdict | Notes |
| --- | --- | --- | --- |
| Open CASCADE (OCCT) | LGPL-2.1 with the Open CASCADE exception for headers [S24, S25] | **Module + Sidecar** | The only open B-rep CAD kernel with STEP/IGES import and booleans at industrial level. Huge (hundreds of MB built), slow to compile, LGPL. Only worth it for a future CAD/3D studio. Ship as optional downloadable module in its own sidecar process, never in the base installer. Rust: `opencascade-rs` wrappers exist (Unverified); the pure-Rust `truck` kernel (Apache-2.0 [S26]) is far less complete but WASM-friendly. Verdict: **no CAD studio now**; if it comes, start with `truck` + mesh/glTF, add OCCT only for STEP. |
| Manifold (mesh booleans) | Apache-2.0 [S27] | **Use (C++ lib via small binding or WASM)** | Small, robust mesh booleans for 3D modelling; a good, rare C++ library that is clean to build. |
| Bullet | zlib [S28] | **Avoid** | Use `rapier` (Rust, Apache-2.0 [S29]) for physics in animation/Vibe studios. |
| Assimp / tinygltf | BSD / MIT (Unverified) | **Avoid** | glTF via Rust crates (`gltf`) covers the open format; Somnia's rule "the open format decides the toolset" favours glTF/SVG/PNG/PDF. |
| Blender | GPL | **Avoid linking; interop only** | Never embed or link. Open `.glb`/`.obj` exchange is fine. |
| Lottie / Rive runtimes | MIT [S30, S31] | **Use (JS/WASM)** | Animation playback already belongs to the web layer. `rive-runtime` is C++ with MIT license, a candidate for rendering `.riv`, but the format is vendor-led (Unverified roadmap fit). |
| Qt, JUCE, wxWidgets | GPL/LGPL/commercial | **Avoid** | Somnia's UI is web + Tauri. A second UI toolkit would double design-system work and licensing risk. |

### Performance of the desktop shell itself

Native-speed work that today runs in JS is better moved to **Rust** (Tauri commands, rayon, wgpu compute) than to C++: same speed, memory safety, one toolchain, WASM-compatible. The existing performance concept (`performance-resource-architecture.md`) stays the plan; C++ is not on its critical path.

## 4. Integration architecture (Proposed)

- **One shape for native helpers**: a `helper` manifest (name, version, source revision, per-OS artifact URL, sha256, license id, capabilities) and a Rust `HelperHost` that starts the sidecar with a minimal environment, no network unless the manifest says so, a working directory under the project sandbox, stdio JSON-lines protocol and watchdog timeouts. Same shape serves whisper.cpp, llama.cpp, FFmpeg-LGPL, OCCT.
- **Built-in vs download**: base installer carries only small permissive libs linked into Rust; everything over roughly 50 MB, every LGPL library and every GPU runtime is an optional module with source offer and digest.
- **Licenses**: each module appears in Settings > Licenses with text, version and source link; the LGPL source offer is a link to the exact tag that CI built.
- **CI**: one reusable workflow per helper, matrix ubuntu/windows/macos, cache by source revision, artifacts attached to the GitHub Release, signed together with the app. Path to avoid costs: public repo, standard runners, no larger runners, no self-hosted spend [S12]. Time budget is the limit: an OCCT or full OpenCV build can take tens of minutes per OS; cache and build only on tag.
- **Fallback**: every module is optional. If it is missing or blocked, the studio shows the feature as unavailable with the Download action, never a silent downgrade.

## 5. Map to studios

| Studio / feature | Needs | Recommendation |
| --- | --- | --- |
| Code | none | Nothing native. |
| Sound | decode/encode, device I/O, STT/TTS | Rust (Symphonia, cpal, existing sound crate); whisper.cpp and sherpa-onnx as sidecars; opus/flac small C libs. |
| Video | decode/encode, effects, transcription | WebCodecs + OS encoders; optional LGPL FFmpeg module for formats the WebView cannot decode; whisper.cpp captions. No GPL. |
| Photos | filters, RAW, upscaling, masks | Rust photos engine first; ONNX Runtime for AI masks/upscaling; OpenCV or LibRaw only as modules for named gaps; OCIO/OpenEXR if HDR is scheduled. |
| Design / Vector | 2D rendering, boolean ops | Rust + web; `vello`/`wgpu` if a native renderer is needed. No Skia. |
| Animation | timelines, physics, playback | Web/WASM (Lottie), `rapier` (Rust). |
| 3D / CAD (not built) | geometry kernel, meshes | glTF + Manifold first; `truck` experiments; OCCT as a later optional module only if STEP import is a firm requirement. |
| Local models / voice | LLM, STT, TTS | Ollama (existing), then llama.cpp sidecar fallback; whisper.cpp; sherpa-onnx; ONNX Runtime for the rest. |

## 6. Risks and open decisions for the owner

- **Signing debt.** Each new binary raises SmartScreen/Gatekeeper friction until an Apple Developer ID (open, $99/yr) and a Windows signing route (SignPath application prepared) exist. Recommendation: do not add new bundled native binaries before that, except as downloaded modules with digest pinning.
- **LGPL handling.** One decision needed: allow LGPL libraries as downloadable sidecars (recommended) or ban them outright (simpler, loses FFmpeg and OCCT).
- **Microsoft Store.** Packaged helpers must pass store policy review (MSIX); unverified for downloaded executables. Test before promising modules in the Store build.
- **GPU matrix.** CUDA/Metal/DirectML/Vulkan behaviour is untested on real devices here.
- **Maintenance.** Bindings (`whisper-rs`, `llama-cpp-2`, `opencv-rust`) lag upstream; pin revisions and keep a small C API wrapper as the escape hatch.
- **Scope creep.** A CAD or 3D studio is a product decision, not a library decision. No C++ library changes the 12-month, 11-person estimate for it.

## 7. Suggested sequence (no commitment)

1. Write the helper manifest + `HelperHost` contract and test it with a trivial permissive helper (Proposed).
2. whisper.cpp sidecar (already in the voice concept), then llama.cpp sidecar behind the existing RuntimeAdapter.
3. ONNX Runtime via `ort` for Photos AI features, CPU + one GPU provider per OS.
4. Optional FFmpeg-LGPL module, only after the LGPL decision and codec policy.
5. OCCT only if a CAD studio is approved.

## Sources (fetched 2026-10-14)

- [S1] llama.cpp and ggml license, MIT: https://raw.githubusercontent.com/ggml-org/llama.cpp/master/LICENSE and https://raw.githubusercontent.com/ggml-org/ggml/master/LICENSE
- [S2] whisper.cpp license (MIT) and README (Metal, Core ML, Vulkan, OpenVINO, WebAssembly): https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/LICENSE and https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/README.md
- [S3] whisper-rs (Unlicense, migrated to Codeberg): https://raw.githubusercontent.com/tazz4843/whisper-rs/master/README.md and /LICENSE
- [S4] llama-cpp-rs: https://raw.githubusercontent.com/utilityai/llama-cpp-rs/main/README.md
- [S5] FFmpeg legal page (LGPL default, GPL parts, nonfree, patent FAQ) and license file: https://ffmpeg.org/legal.html and https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/LICENSE.md
- [S6] ONNX Runtime, MIT: https://raw.githubusercontent.com/microsoft/onnxruntime/main/LICENSE
- [S7] `ort` crate, MIT: https://raw.githubusercontent.com/pykeio/ort/main/LICENSE-MIT
- [S8] ncnn, BSD-3 (Tencent): https://raw.githubusercontent.com/Tencent/ncnn/master/LICENSE.txt
- [S9] Candle, MIT: https://raw.githubusercontent.com/huggingface/candle/main/LICENSE-MIT
- [S10] MLC LLM, Apache-2.0: https://raw.githubusercontent.com/mlc-ai/mlc-llm/main/LICENSE
- [S11] XNNPACK, BSD: https://raw.githubusercontent.com/google/XNNPACK/master/LICENSE
- [S12] GitHub Actions billing, free for public repositories on standard runners: https://docs.github.com/en/billing/concepts/product-billing/github-actions
- [S13] rav1e, BSD-2: https://raw.githubusercontent.com/xiph/rav1e/master/LICENSE
- [S14] MLT, LGPL-2.1: https://raw.githubusercontent.com/mltframework/mlt/master/COPYING
- [S15] PortAudio license: https://raw.githubusercontent.com/PortAudio/portaudio/master/LICENSE.txt
- [S16] OpenCV, Apache-2.0: https://raw.githubusercontent.com/opencv/opencv/master/LICENSE
- [S17] libvips, LGPL-2.1: https://raw.githubusercontent.com/libvips/libvips/master/LICENSE
- [S18] ImageMagick License: https://raw.githubusercontent.com/ImageMagick/ImageMagick/main/LICENSE
- [S19] Skia, BSD-3: https://raw.githubusercontent.com/google/skia/main/LICENSE
- [S20] wgpu MIT, vello MIT: https://raw.githubusercontent.com/gfx-rs/wgpu/trunk/LICENSE.MIT and https://raw.githubusercontent.com/linebender/vello/main/LICENSE-MIT
- [S21] OpenColorIO, BSD-3: https://raw.githubusercontent.com/AcademySoftwareFoundation/OpenColorIO/main/LICENSE
- [S22] OpenEXR, BSD-3: https://raw.githubusercontent.com/AcademySoftwareFoundation/openexr/main/LICENSE.md
- [S23] zimg, WTFPL: https://raw.githubusercontent.com/sekrit-twc/zimg/master/COPYING
- [S24] OCCT, LGPL-2.1: https://raw.githubusercontent.com/Open-Cascade-SAS/OCCT/master/LICENSE_LGPL_21.txt
- [S25] OCCT exception: https://raw.githubusercontent.com/Open-Cascade-SAS/OCCT/master/OCCT_LGPL_EXCEPTION.txt
- [S26] truck, Apache-2.0: https://raw.githubusercontent.com/ricosjp/truck/master/LICENSE
- [S27] Manifold, Apache-2.0: https://raw.githubusercontent.com/elalish/manifold/master/LICENSE
- [S28] Bullet, zlib: https://raw.githubusercontent.com/bulletphysics/bullet3/master/LICENSE.txt
- [S29] Rapier, Apache-2.0: https://raw.githubusercontent.com/dimforge/rapier/master/LICENSE
- [S30] Rive runtime, MIT: https://raw.githubusercontent.com/rive-app/rive-runtime/main/LICENSE
- [S31] lottie-web, MIT: https://raw.githubusercontent.com/airbnb/lottie-web/master/LICENSE.md
- [S32] Tauri sidecar (`externalBin`): https://v2.tauri.app/develop/sidecar/
