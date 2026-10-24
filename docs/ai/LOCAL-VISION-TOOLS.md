# Local vision/tools routing slice

## Implemented

- Every panel Ollama request rechecks local weights and, when tools/images are present, fresh declared `/api/show` capabilities. Missing capability is Unknown and refuses the affected request. Model names and OpenAI-compatible origins never prove support. Automatic request retries are disabled for this gated panel path so no retry bypasses these checks.
- Images are explicit user-role prepared PNG/JPEG parts. Local > Describe image requires a user-selected file, per-file opt-in and an explicitly saved context size. Decode/downscale to at most 1024 px/re-encode strips original metadata; at most four bounded parts per provider request. The first UI supports one image. No canvas capture, original-byte forwarding, tools, cloud fallback or automatic document edits. The result is plain description text. Cancel/120s deadline/unmount abort the request, and AI activity blocks competing configuration/mutations.
- Ollama chat maps `images` only on user messages. Unsupported cloud provider adapters reject images instead of silently dropping them. Image-bearing session snapshots strip base64; restore refuses such snapshots. The explicit description UI never persists image input or output history.
- Registered studios have optional saved local model overrides under versioned preferences. Refresh offers local-weight-verified entries with declared tool support. Save revalidates them. Cloud selections are not switched; unknown/missing references do not silently fall back. The chosen studio/model is captured at run creation; switching studios does not retarget the run. Tool registry permissions/review are unchanged. Delete refuses models used by saved studio choices until replacements are saved.

## Limits

Declared tools/vision support is not a quality probe or task certification. Synthetic capability benchmark/probe cache, tool schema lint/pruning, two-model describe_image tool, canvas rendering and vision studio result application remain separate. The explicit description uses the saved global Ollama model, not an automatic vision model. Studio overrides here cover existing panel text/tools runs only, not autonomous Vibe Space workers or CLI. Inference checks are panel-bound, not a claim that every historical Ollama adapter consumer gained capability routing.

Voice runtime decision: no STT/TTS inference was added. Real local speech requires a verified native helper/binding, model artifacts, sample-rate/cancellation handling and license review. There is no dependency-free speech engine in this slice. Browser SpeechRecognition/SpeechSynthesis is not misrepresented as offline. Candidate whisper.cpp/sherpa-onnx remain owner-reviewed follow-ups; no new dependency or artifact download is included.

No cargo/WASM run; native tests/full app E2E CI-only. No live Ollama daemon or device vision quality was tested. Typecheck still has existing missing generated slides-engine/pkg/somnia_slides.js. The per-request daemon self-report trust limit remains. Management and image inference use the existing loopback transport; a packaged-webview CORS test on owner hardware is still needed.

Roadmap delta: verified-request capability gates, opt-in image description and studio local-model overrides implemented. Voice inference, quality probes and multi-model vision tools remain open.
