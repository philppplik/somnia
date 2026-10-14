# Local runtime advanced preferences

Version 1 non-secret preferences persist requested num_ctx and keep_alive seconds atomically with Agent settings. Blank leaves the daemon default untouched. Context bounds: integer 1–1,048,576; keep-alive: integer 0–86,400. Zero unloads after a request. No fixed daemon context default, guaranteed effective context, speed or exclusive ownership is claimed.

Local > Advanced uses drafts and the existing Save/running/review/auth guards. Editing never runs inference or preloads. Cloud selections retain these local preferences without sending them to cloud providers. Both frontend/browser and native migration accept old files without localRuntime and reject unknown fields/version/invalid ranges. Ollama receives requested values only after saved configuration; verifyLocalModel remains unchanged.

Qwen2.5-Coder-7B-Instruct license verified against the publisher's Hugging Face repository: https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct/raw/main/LICENSE (Apache License 2.0). The catalog license link now points to that verified source, not an unresolved Ollama subpath. Other variants still need their own source review.

No dependency added. Rust tests and full app E2E CI-only; no cargo/WASM. Native preference roundtrip needs device validation. Typecheck in this checkout is blocked by existing generated slides-engine/pkg/somnia_slides.js absence. Phase C advanced preferences complete; Phase D read-only alternate runtime/CLI discovery remains separate.
