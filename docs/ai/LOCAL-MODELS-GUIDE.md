# Local models in Settings > AI

## What each label means

Installed means an exact tag is present in the daemon inventory. Local weights reported means the daemon's metadata looks local, not that Somnia can detect a dishonest proxy. Advertised Text/Tools/Vision is model metadata, not tested task quality. Loaded/VRAM comes from the last `/api/ps` response and is not free capacity or exclusive ownership. Fit is a visible heuristic, not a speed or allocation guarantee. Unknown stays unknown.

## Start and manage

Open Settings > AI > Local. Refresh is a metadata request. Start launches a known installed app on Windows/macOS; on Linux run the shown service command yourself. Start does not install or guarantee readiness. Use Refresh after starting.

Enter an exact library variant to download. Review the source, license/size/storage limits and network use before confirming. Update re-pulls the same variant. Layer byte counts are not overall installation progress; completion needs terminal daemon success plus fresh inventory and local verification. Cancelling stops Somnia's connection, not necessarily a shared daemon download. Unknown cancellation means inspect/refresh before retrying. Do not assume another client's work stopped.

Remove confirms the model, checks saved uses and fresh digest, refuses loaded models and reconciles absence afterward. Save replacement models first. Shared blobs mean model bytes are not guaranteed freed space. No cloud fallback or silent download occurs.

## Model choice and advanced settings

Providers chooses the global Agent model. Local studio overrides are drafts until Save; only locally verified weights with declared tool support are listed, and Save revalidates. Missing references stay visible and fail clearly rather than selecting another model. Cloud providers are not silently replaced. Overrides apply to the shared panel, not autonomous workers or CLI.

Advanced context and keep-alive are saved with the configuration. Blank leaves daemon defaults unspecified. Requested context may be clamped. Keep-alive is a retention hint, not ownership; zero unloads after each request. These values do not modify global Ollama configuration.

## Image description

Choose your own PNG/JPEG and opt in for that file/model. Somnia downsizes/re-encodes it, then rechecks exact-request local weights and declared vision. Save explicit context first. The response is text for review, not a document edit. No automatic canvas capture, project image disclosure, cloud fallback, OCR precision guarantee or persistent image history. Cancel or close to stop.

## Quality probes

Click Run tool probe or Run vision probe explicitly. The test spends local inference time using nonsensitive synthetic inputs, not your files. Tool fixtures check echo call, relevant-tool choice and plain-text response after a synthetic tool result, repeated three times. Nothing calls a real host tool. Vision fixtures are generated red square, SOMNIA word and circle-left/square-right images. A pass shows only those fixtures worked for that digest/daemon/context; it does not certify complex tools, dense OCR, visual taste or benchmark speed.

Cache is memory-only for this application session, keyed by endpoint, exact tag/digest, daemon version, explicit context and probe implementation version. Read cached test first rechecks current identity. Changed identity discards old eligibility; tests never run automatically. Missing/failed probes do not grant tools or widen any permission. Cancellation/errors do not save success reports.

Local tool schemas are inspected before offering them: simple flat or one-level forms are allowed; compositions/references, object arrays, deep/large schemas and long descriptions are marked complex and omitted. At most the first eight eligible tools in the existing host-provided order are sent. Schemas are not rewritten and their permission hashes are unchanged. A model calling an omitted/unoffered tool is refused before host execution. This is a compatibility heuristic, not a new authorization mechanism. Choose a simpler task or a different provider if required tools are omitted.

## Other runtimes and voice

llama.cpp/LM Studio inspection is metadata-only. A loopback/OpenAI-compatible endpoint does not prove local inference or enable chat/tools. CLI `somnia models` has the same boundary. GGUF/server lifecycle stays user-managed. Authenticated LM Studio may refuse inspection.

Local STT/TTS is not implemented. Browser speech APIs are not offered as a fake offline substitute. The proposed native voice helper requires a separate reviewed binary/artifact/packaging decision. See the concept, not a working download button.

## Verification still needed

Native Windows/macOS/Linux start/probes and packaged-webview daemon access need device tests. Quality/performance claims require actual opt-in fixture results with exact model digest, runtime and hardware. Existing mock/rendered tests are not live model evidence.
