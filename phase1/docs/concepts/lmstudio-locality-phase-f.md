# LM Studio locality review and Vibe onboarding (phase F)

Decision: keep LM Studio blocked in local-only mode. Model inventory, file format, size and loaded instance metadata are not enough to attest that inference runs on this host. This is an intentional supported limitation, not an unavailable integration.

Current official documentation says LM Link can serve requests made to localhost on a remote device. If a model is on several devices, REST uses the preferred device. The v1 model list documents key, size_bytes, format, architecture, loaded_instances and load config, but not an execution-host-local attestation that overrides this behavior. Consequently this slice does not promote even a loaded GGUF/MLX instance to verified-local. Disabling Link through an unverified preference or inventing a host field would not be evidence. OAuth/API-token-protected servers whose inventory cannot be read remain unknown; no credential is requested or bypassed here.

Sources inspected:
- https://lmstudio.ai/docs/developer/core/lmlink : remote device serving localhost, preferred-device selection.
- https://lmstudio.ai/docs/developer/rest/list : v1 model/loaded-instance fields, no documented host-local assertion.
- https://lmstudio.ai/docs/developer/rest/load : instance and load config, not execution locality.
- https://lmstudio.ai/docs/developer/rest : native API and OpenAI-compatible routes.
- https://lmstudio.ai/docs/developer/openai-compat/models : listing is not weight-locality proof.
- https://lmstudio.ai/docs/lmlink : models across linked devices.
- https://lmstudio.ai/docs/app/offline : local offline use is possible, but is not evidence for a specific request with LM Link.

New Studio now has a small read-only local-model readiness card. It checks Ollama and LM Studio loopback APIs on mount and on manual recheck, distinguishes unreachable/access denied from responding-but-invalid inventory, empty inventory and unverified models, and gives plain German/English next steps. A daemon response never means the app is installed or physically local. Ollama onboarding inspects at most three inventory entries for positive weight evidence, not every model; the exact selected model is separately checked at native request time. No inference, load, download, process start or settings mutation. No new dependencies. No auto pull.

## Roadmap-Delta

Added two-daemon New Studio onboarding and conservative LM Studio locality regression test for plausible loaded-instance metadata. Existing native deny remains unchanged. LM Studio verified-local execution stays open until the API offers a verifiable execution-device contract. E's positive native Ollama guard stays in place. Native builds, real-daemon/local-only behavior and full application E2E are CI/device gates; no cargo/WASM run locally.
