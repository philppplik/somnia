# Local AI in Somnia

Use Ollama for local Agent requests and supported local Vibe runs. Somnia does not install a daemon or download a model without an explicit action. A model listed by a daemon is not a guarantee of quality, available memory, or physical execution on this device.

This guide describes the A-V development stack. Packaged desktop behavior and real-device tests still need acceptance evidence. See [the acceptance checklist](LOCAL-AI-ACCEPTANCE.md). Some controls are experimental or unavailable in builds whose flags are off.

## Set up Ollama

1. Open Settings > Power-Ups > AI > Local. In some navigation contexts this is shortened to Settings > AI > Local.
2. Inspect or Refresh the runtime. If it is unavailable, use the first-run guide to install Ollama yourself. Somnia does not run an installer or installation shell script.
3. Start the installed Ollama app using the available action on Windows/macOS. On Linux, follow the shown service instructions yourself. Start is not proof that the daemon is ready. Refresh again.
4. Choose an exact model variant. Review its source, license information, estimated size and network download before confirming. Unknown information remains unknown.
5. Select and check the volume for the download review. This measures that folder's capacity, not an attestation that Ollama stores its models there. Required space for arbitrary tags can be unknown. A passed check is not a reservation or a guarantee the model fits.
6. After download, wait for successful reconciliation. Select the installed model in Providers & models and Save AI settings. Downloading a model does not select it for you.

Readiness inspection is metadata-only. Downloading weights needs internet even when inference will be local. No model is downloaded on entry, on Refresh or because a hardware hint recommends it.

## Choose and manage models

Installed tags, quantization and sizes come from Ollama's inventory. Loaded state and model VRAM are daemon reports. Hardware fit is an estimate, not a speed, allocation or task-quality guarantee. Unified memory is not an extra independent GPU pool. Unknown capacity stays unknown.

The model manager's last-used label means successful Agent completion observed by Somnia on this device at that endpoint. It excludes other applications and native Vibe use. Model modification/download time is not last use.

Update re-pulls the exact reviewed variant. Progress is per layer, not a made-up overall percentage. Cancel stops Somnia's owned connection; the shared daemon may continue. Refresh before retrying. Resume/retry opens a fresh review and disk check for the same model. Ollama may reuse partial layers, but byte-offset resume is not guaranteed.

Remove requires confirmation, a fresh identity check and an unloaded model. Replace or clear saved Agent, task and studio references first, then Save. Removing shared model blobs does not guarantee the reported size becomes free disk space. External clients can race Somnia's checks.

### Context and model defaults

Local advanced preferences request context and keep-alive settings. Blank leaves the daemon default unspecified. The daemon can clamp context. Keep-alive is a retention hint, not ownership; zero asks for unloading after the request. These preferences do not rewrite Ollama's global configuration.

Per-task defaults are explicit: chat, vibe, code and summarize. Selection edits a draft; Save persists it. Agent task choice is explicit, not inferred from prompt words. A task default takes precedence over a saved studio default and global model. It cannot silently fall back to cloud. A missing exact model is an error, not a reason to substitute another one. A studio default applies only in its supported panel scope, not to every worker or CLI call.

New Studio can explicitly adopt the saved Vibe default. Existing Studios keep their pinned model. Readiness cards help with setup but do not authorize inference. Native Vibe checks the exact Ollama model again before each request.

### Other runtimes

llama.cpp and LM Studio discovery is read-only metadata inspection. The CLI `somnia models` also lists models; it does not enable inference parity, manage a GGUF server or certify tools/images/speech.

LM Studio remains unverified in local-only mode. A localhost address, loaded model or OpenAI-compatible API does not establish execution on this host. Somnia does not treat that inventory as verified-local evidence. Set up those servers yourself; protected or unreadable inventory remains unknown.

## Offline mode and cloud routing

Save the offline AI preference to block Somnia's supported cloud provider paths, including configured fallback. The setting is separate from route order: turning it on preserves routes rather than silently deleting them. Editing the checkbox alone is a draft.

This is not a system firewall. It does not disable networking, prevent an explicit weights/helper download, audit a user-managed daemon, or cover unrelated update/OAuth/MCP traffic. Local metadata can lie; "local weights reported" is not cryptographic proof. Cancellation cannot recall bytes already sent.

General plain chat may use an explicitly saved local-first route. Cloud destinations still require their normal consent and authentication. Routing does not move document, image, tool or studio work to another provider. There is no fallback after a provider event. Task-scoped local runs remain pinned. Request retries and cloud fallback can incur charges even without a visible answer.

In Vibe, capped board mode blocks cloud/unknown-local routes. Its local stop threshold uses reported usage, not a strict token or dollar reservation. Usage can arrive after a request, and concurrent local work can exceed the threshold. Missing usage is not zero. Inspect the recorded provider/model and usage; model suggestions do not automatically switch anything.

## Control what a local request receives

The local Agent checklist lets you include or exclude active document/media and its tools, selection, studio context, custom instructions and prior chat. History is off by default for this local context mode. Excluding a source removes that source from the supported request path, not merely from the visible estimate.

The size estimate is partial: UTF-8 bytes divided by four is not model tokenization. It does not include all system/tool schemas, history, media or later tool results. The document ceiling rejects oversized content rather than quietly treating a truncated file as complete. Lower the ceiling or exclude sources when needed.

Templates are saved locally. Use as draft replaces editable prompt text; it does not send, pick a model, grant tools or change the project.

## Images, tools and suggestions

Describe image requires a file you choose, file-specific opt-in and a saved context setting. Prepared PNG/JPEG content is resized/re-encoded, not automatic canvas capture. Results are text for review. No image-description history is saved by that control.

Declared vision/tool capabilities are metadata, not demonstrated quality. Explicit synthetic probes exercise narrow fixtures without real host tools. A probe pass is not approval to execute tools or proof of reliable OCR. Cached probes are session-only and identity-specific.

Complex tool schemas may be omitted rather than rewritten. Existing host permissions and review still apply. If a needed tool is unavailable, simplify the task or choose another supported model explicitly.

Supported image descriptions and Interface/Animation/3D suggestions expose a specific destination and before/after review. Apply is explicit and revision/selection guarded. Reject or close a proposal if it is wrong. Undo refuses to overwrite newer work. A 3D suggestion note is session context, not exported geometry. Provisional or cancelled Vibe text cannot be applied to the project. Retry with feedback creates fresh work from the current baseline, not a replay of partial tool effects or permissions.

## Compare and evaluate models

Local comparison runs selected installed models sequentially with one editable prompt. Task evaluation offers a small editable German prompt for each task and one or two models. Click Run explicitly. Opening history, changing a task or refreshing does not run tests.

Results retain model tag/digest, literal output and latency. Timing includes checks and inference, not pure model speed. Tokens/rate appear only if reported. These controls are not benchmarks, automated quality scores or proof that generated code is correct. They do not execute code, use document tools or fall back to cloud.

Save results explicitly. Comparison and evaluation share one bounded local history; delete entries when it is full. Comparison JSON import requires review, creates new IDs and keeps imported results marked unverified. Import does not run anything. Exported prompts/results may be private. A privacy-inventory export is a separate review format, not an automatic restore/import format.

## What stays on this device

The local-store privacy view lists templates, comparison history, evaluation results, the saved offline flag and helper state/files. Inspect explicitly. Sizes for JSON categories are logical payload sizes, not disk allocation; the two history categories share storage. Native helper inventory counts actual helper files. Unknown means unavailable, not empty.

Each category has a local export and separately confirmed delete/reset. Helper export is status-only, never audio, executable or speech weights. Deleting one history category keeps the other. Resetting the offline flag removes forced offline-only mode but grants no new cloud consent. Helper removal keeps the speech model and refuses active work/another owner's lock.

This feature adds no automatic sync. The inventory is not every app store: last-use metadata, Vibe databases/journals, ordinary chat, other preferences and project recovery data have their own behavior. OS/browser backup or sync, prior exports and in-memory results are not erased. Refresh other panels after deletion. This is not secure wiping. Provider credentials remain separate from these exports.

## Voice: experimental, unavailable by default

The whisper.cpp helper is an optional separate download, not a bundled release. The release inventory is currently empty and both preview gates remain off by default. No reviewed helper source/checksum is available for installation. Do not substitute an arbitrary executable or assume a fake-process test is a working engine.

Before voice is enabled, real target artifacts need license/linkage review, real checksums/notices and isolation/orphan-cleanup acceptance. Engine license alone does not establish all artifact licenses. Linux grandchild containment and the Windows spawn-to-job assignment window remain unresolved release concerns. TTS is separate and is not supplied by dictation.

When a reviewed preview is available, microphone consent and OS/browser permission are explicit. Hold to record and release to transcribe locally. German and English are language choices for one multilingual model. Edit the final transcript and explicitly add it to the prompt. Nothing is sent automatically. Sending that prompt later still follows the chosen provider's normal disclosure rules; local transcription does not make a later cloud send local.

## Troubleshooting

| Symptom | Next step |
| --- | --- |
| Runtime unreachable | Start your installed daemon, then Refresh. Check the configured loopback endpoint. Failed detection is not proof the app is absent. |
| Inventory or loaded state Unknown | Retry metadata inspection. Do not assume zero installed models or enough free memory. |
| Missing assigned model | Install the exact variant through review, or explicitly replace/clear the saved assignment. No silent substitute. |
| Download interrupted | Refresh, then review Retry/resume for that exact model and choose the volume again. Do not assume the shared daemon stopped. |
| Remove refused | Resolve active work/review, replace saved references and unload the model. Refresh identity before confirming again. |
| Locality/capability refused | Inspect the exact model's fresh metadata. A name, loopback origin or model listing is insufficient. No cloud workaround is automatic. |
| Context too large | Exclude sources or lower the document scope; inspect saved requested context. The estimate is not a hard total token budget. |
| Board cap stops work | Inspect reported usage and policy. Changing the view filter does not reset totals. Capped mode blocks cloud rather than enforcing a dollar reservation. |
| Save/export unavailable | Check the saved configuration/store state. Full, corrupt or unavailable storage is not successful persistence. Keep existing exports private. |
| Voice setup unavailable | Expected without reviewed helper artifacts and enabled preview gates. Fake UI/process tests are not installation instructions. |
| Cancelled/partial answer | Treat it as incomplete. Do not apply it. An explicit fresh retry is different from replaying the old run. |

Local inference still uses hardware, electricity and time. No model quality, speed, capacity or zero-egress guarantee is made by this guide. The acceptance checklist separates fixture evidence from native, packaged and real-device work.
