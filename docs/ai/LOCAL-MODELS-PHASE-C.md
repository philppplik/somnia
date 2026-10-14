# Local models: Phase C hardware and candidate catalog

Based on Phase B commit 33401425. No new dependency or sysinfo crate.

## Implemented

One-shot read-only hardware snapshots run on Local entry and explicit refresh, never on a background timer. Linux reads /proc memory/CPU and DRM sysfs devices; Windows uses a fixed non-interactive CIM query; macOS uses fixed sysctl/vm_stat/system_profiler probes. Optional nvidia-smi reports discrete per-device total/free bytes. Commands have output/time bounds, no shell, no project-controlled arguments and stripped environment credentials. Missing probes remain unknown.

CIM AdapterRAM is explicitly a lower bound, not accurate free VRAM. Apple Silicon is unified memory, not a second RAM pool. GPU capacities are never summed. Linux sysfs VRAM total-used can supply free bytes. CPU/core count is display-only. Model-volume free space remains Not checked, not guessed from Somnia's volume.

Fit labels are estimates only: weights + 25% runtime reserve + 1 GiB context/headroom compared against each discrete device's trustworthy free VRAM, then available RAM. This is a visible heuristic, not a benchmark or a guarantee at arbitrary context/concurrency. Unknown VRAM cannot justify an insufficient-memory claim. Unified GPU memory is not added to system RAM. No speed or allocation promise.

The daemon /api/ps model size_vram is displayed separately as the actual reported loaded VRAM amount. Loaded, not loaded, unknown loaded state, model capability and fit remain separate facts. A loaded model does not prove exclusive use or available capacity.

The bundled catalog has five exact tags, version/date, source/license links, candidate tasks, advertised modalities, estimated download bytes, explicit untested confidence and image-adapter limitation. No voice, automatic model selection, network catalog refresh or download on entry. Show/task checks remain necessary. Tags are not pinned digests. Catalog values are dated vendor observations. Gemma 3 4B is now reported as 3.4 GB on the current tags page, rather than the older concept's 3.3 GB.

The integrator's i18n layering change is preserved: localModelsI18n lives directly under lib/, not lib/agent/.

## Verification and remaining work

Unit tests cover per-device/no-aggregation, unified memory, lower-bound/unknown capacity, fit allowance, /api/ps parsing and the exact catalog boundaries. Rust parser tests cover Linux units, NVIDIA device parsing and macOS page sizes. Rendered fixtures cover actual reported VRAM, estimate wording, storage unknown, source links and image adapter limit; light desktop and dark narrow layout pixels are inspected.

No cargo/WASM run. Rust tests and full app E2E remain CI-only. Native Windows/macOS/Linux probe behavior is unverified on owner hardware. Full typecheck is blocked only by the existing missing generated slides-engine/pkg/somnia_slides.js module. macOS free+inactive pages is a best-effort snapshot, not memory pressure or a guaranteed allocation.

Roadmap delta: Phase C hardware/fit/catalog slice implemented. Advanced num_ctx/keep_alive persistence and routing remain separate work; Phase D alternate runtimes/CLI models still pending. This change deliberately does not silently invent a cross-version context default or edit runtime environment settings.

## Vendor sources reviewed 2026-10-14

- https://ollama.com/library/qwen3:1.7b
- https://ollama.com/library/qwen3:4b
- https://ollama.com/library/qwen3:8b
- https://ollama.com/library/qwen3/tags (1.4/2.5/5.2 GB variant sizes)
- https://ollama.com/library/qwen2.5-coder:7b (4.7 GB)
- qwen2.5-coder license fetch did not resolve; the catalog explicitly marks its license unverified rather than assigning a license.
- https://ollama.com/library/gemma3:4b
- https://ollama.com/library/gemma3/tags (current 3.4 GB)
