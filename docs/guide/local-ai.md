# Local AI (Ollama)

Status: **In development** on `int/beta5`. Packaged-app behaviour on real devices still needs acceptance evidence. See [the acceptance checklist](../ai/LOCAL-AI-ACCEPTANCE.md).

Use Ollama for Agent requests and supported Vibe Space runs on your own machine. Somnia never installs the daemon and never downloads a model without an explicit action from you.

## Set up

1. Open **Settings > AI > Local** and press Refresh.
2. If Ollama is missing, the first-run guide links the official downloads. Install and start it yourself. Somnia runs no installer.
3. Pick an exact model variant and review its source, licence and size. Confirm the download. A model download needs internet even for local use.
4. When the download is reconciled, select the model under Providers and models, then **Save AI settings**. Downloading does not select the model.

## What you control

- Task defaults for chat, vibe, code and summarize, and optional studio overrides. A missing model is an error, never a silent switch to another model or to the cloud.
- Context size and keep-alive. They are requests to the daemon, not changes to its global config.
- Offline AI preference: blocks Somnia's cloud provider paths. It is not a system firewall.
- A checklist of what a local request may include (document, selection, studio context, instructions, history). Excluded sources are not sent.
- Update, remove and cancel for models. Remove checks that the model is unloaded and that no saved setting still points to it.

## Describe an image and studio suggestions

- **Describe image**: you choose the file and opt in per file. It returns text for review. It can be applied to Code Markdown or an HTML image `alt` attribute, as a reviewed diff.
- **Interface**: a frame annotation from structural metadata, and alt text for image fills.
- **Animation**: one name for the selected layer.
- **3D**: a session note about bounded scene metadata. It is not saved in exports.

Each suggestion shows before and after, and needs your acceptance. Later edits stop the dedicated undo rather than overwrite newer work.

## Compare and test models

Run a comparison or a task evaluation on selected installed models. Nothing runs by itself. Results are labelled with the exact model digest and timing. They are not benchmarks. Tool and vision probes use synthetic inputs only and do not grant permissions.

## Limits

- Hardware fit hints are estimates. Capability labels (text, tools, vision) are model metadata, not tested quality.
- llama.cpp and LM Studio are listed from metadata only. A localhost address does not prove local inference.
- Local speech to text and text to speech are not available.
- Removing a model may not free the reported disk space, because Ollama shares blobs.

## Technical docs

[Local AI in Somnia](../ai/LOCAL-AI-IN-SOMNIA.md) (full guide, also in [German](../ai/LOCAL-AI-IN-SOMNIA.de.md)), [model guide](../ai/LOCAL-MODELS-GUIDE.md), [Ollama provider](../agent/ollama-provider.md), [OpenRouter and Ollama](../agent/using-openrouter-and-ollama.md).
