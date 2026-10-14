# Alternate runtime and CLI discovery

Phase D slice: read-only alternate model discovery, not inference parity.

Settings > AI > Local has explicit llama.cpp/LM Studio origin and inspection controls. Only HTTP loopback origins are allowed; no credentials, redirects, proxy, arbitrary paths, lifecycle commands, automatic fallback, chat or tools. llama.cpp reads `/v1/models`, LM Studio reads `/api/v1/models`. Inference locality stays unverified. A model list never certifies text/tool/image/speech compatibility. GGUF/model and server lifecycle remain user-managed. LM Studio with required auth returns an honest error, not a credential workaround.

`somnia models --runtime ollama|llama.cpp|lmstudio [--endpoint http://127.0.0.1:PORT] [--json]` uses the existing bundled engine sidecar, direct Node HTTP with request/body bounds and timeouts. No new Rust dependency or payment. The CLI subprocess has a 10-second upper bound and bounded output. Existing run/task protocol remains unchanged. Discovery does not need a git project or model environment setting. Every row says inference unverified.

Unit tests use a loopback mock server to prove read-only GET, remote rejection, redirect refusal and unknown locality. The sidecar bundles successfully; Rust CLI execution and native IPC tests are CI-only (no cargo/WASM). Full typecheck still has only existing missing generated slides-engine/pkg/somnia_slides.js. Rendered fixtures show advanced preference fields and the discovery boundary. No live llama.cpp/LM Studio server was tested.

Roadmap delta: Phase D read-only CLI and alternate metadata discovery implemented. Safe inference adapters, task capability routing into studio pickers and alternate runtime management remain separate. Do not route runs to these metadata-only endpoints.

Sources:
- https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md documents `/models` and `/v1/models` metadata and the need to check multimodal capabilities.
- https://lmstudio.ai/docs/developer/rest/list documents `/api/v1/models`, `models[].key`, and authenticated server behavior.
- https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct/raw/main/LICENSE verifies Apache-2.0 for that publisher's exact model.
