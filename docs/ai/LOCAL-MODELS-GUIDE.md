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

## Apply an image description to a studio

The Agent sidebar and Local settings share the opt-in image description control. Only a
complete, uncancelled description exposes application controls. Model/settings changes reset it.
Choose the destination yourself: Code Markdown text (appended as an inert fenced text block),
or the selected unlocked HTML `img` element's `alt` attribute. A picked input image is not
assumed to be the same image as the selected HTML element. Review the exact source diff,
then accept or reject. Acceptance uses the existing native revision-pinned transaction;
undo refuses to overwrite newer edits. Changes stay in editor memory, with autosave held.
Other studios/destinations are refused, not converted or silently redirected. This does not
save a photo caption or image metadata, and does not edit a DOCX or slide.

Local tool schema compatibility can inspect the active source catalog without inference or
tool execution. Each omitted tool names the schema reason, or the eight-tool budget limit.
The catalog is advice, not permission: studio scope and grants may further narrow a request.

## Local AI status

The Local tab status panel shares the inventory check and owned download events. It does
not add background polling or inference. Refresh checks daemon reachability/version and
installed models. An unreadable inventory is unknown, never zero. Browser internet offline
is separate: a local daemon may remain reachable while downloads need internet.
Download status shows the current layer's bytes, not a made-up overall percentage.
Hiding an error only hides that evidence; Refresh rechecks and can show it again.

Image-application controls, schema reasons and the status panel have German, English,
Spanish, French and Brazilian Portuguese copy. Existing shared native
review controls retain their own translations. Integrated apply/undo tests for Markdown and
HTML alt text are in `tests/local-vision-application.spec.ts`, discovered by the regular E2E
CI run. They use synthetic images and mocked Ollama transport, require generated WASM
bridges, and have not been run as full-app E2E in this workspace.

## Local suggestions in Interface, Animation and 3D

The Agent sidebar offers opt-in, tools-free local suggestions for these studios:

- Interface: describe the selected frame's bounded structural metadata into its annotation.
  This is not a pixel-based frame description. For image fills, the explicit image-alt action
  re-prepares the stored PNG locally, then uses verified local vision with explicit context.
  Alt text is a validated image-layer field, used by the canvas, SVG and handoff export.
- Animation: suggest one name for the selected unlocked layer. Typed `layer.update` goes
  through the existing session history. Keyframes, timing and source stay unchanged.
- 3D: describe bounded scene metadata into a reviewable session note. This note is not a
  saved scene property and is not added to GLB or .som3d export. No geometry or pixels sent.

All suggestions pin their source object identity and target selection, require complete
output, show before/after, and need host acceptance. Later edits stop dedicated undo rather
than overwriting newer work. Studio recovery journals keep their usual behavior after an
accepted Interface/Animation edit; no file export/save action is triggered. Closing a result
removes its pending proposal, not an accepted edit. Studio history remains available.

The new Local controls and reasons now have native es/fr/pt-BR copy in addition to en/de;
there are no remaining English fallback entries for this slice.
