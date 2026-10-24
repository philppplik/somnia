# Local AI data flow

Source audit: 2026-10-14. This describes application request paths, not a packet
capture, cryptographic zero-egress guarantee or certification of a user's daemon.
No feature labelled local should silently send project/prompt/audio content to a
cloud model. External downloads/navigation are separate, explicit network actions.

## Content and network destinations

| Feature | Content path | What can leave the device |
| --- | --- | --- |
| Local Agent chat/code/summarize and supported studio proposals | Selected prompt/context -> fresh verified Ollama model over HTTP loopback -> review | No app-directed cloud inference upload. The user-owned daemon is trusted, not sandbox/network-attested. |
| Local context/template controls | Explicit source switches/budget -> local run; templates stored locally | No network from prep/storage. Deliberately included secret prose is not detected. |
| Model status/manager/readiness/hardware/fit/ranking | Local metadata and host hardware facts; bounded in-memory readiness cache | Metadata requests to loopback only. No model quality proof from hardware/capabilities. |
| Model pull/install | Exact user-selected library tag -> local daemon pull | Daemon requests registry/model assets externally. IP/tag/download metadata may leave, not an inference prompt. Not an offline operation. |
| Model removal/launch | Local digest-bound delete or owned daemon start | Local operation; no new cloud inference destination. Shared daemon behavior remains its owner's responsibility. |
| Comparison/evaluation/tool/vision probes | Explicit bounded prompt or synthetic fixtures -> verified local models | No app-directed cloud upload; no real tool callback from synthetic probe. Saved prompt/output history stays local unless user exports/shares it. |
| Vision description/alt text | Explicit selected local image + prompt -> capability-checked local Ollama -> review proposal | No app-directed cloud fallback. Image bytes can be private and must be excluded unless chosen. |
| Optional voice/Whisper preview | Explicit microphone capture -> native PCM/job -> audited optional local helper -> reviewed draft | No cloud STT request in reviewed path. Helper isolation/release evidence must exist; assets are optional/default-off, not certified here. |
| Voice/helper/model asset setup | Explicit review/download -> approved asset sources | HTTPS asset requests to Hugging Face/allowed CDNs or release source. IP/asset metadata may leave, not captured audio. |
| Pure Office/design/search/push-to-talk/ranking helpers (AH-AO) | Explicit text/facts -> bounded draft/chunks/ranking/DTO/state | Nothing: no transport, filesystem discovery, index, capture or auto-apply. Not a working embedding adapter or full native builder integration. |
| Bundled local guide | Generated bundled EN/DE guide literal text | Nothing for reading bundled text. Clicking official documentation/model/license links opens external websites. |
| OpenAI/Anthropic/OpenRouter or remote Ollama configuration | User-chosen provider/model + explicitly allowed context -> consent-gated remote request | Prompt/history/custom instructions, chosen text/images and approved tool results sent to selected provider. OpenRouter can involve its downstream model provider. |
| API key/account test/login | Explicit selected provider auth operation | Credentials/account/auth metadata to the selected provider; auth is network, not local inference or prompt generation. |
| Exports/copy error reports | Explicit export/copy to local JSON/download/clipboard | No automatic upload in these paths. Sharing/export destination or OS clipboard sync is outside this local-only claim. |

## Request gates and scope

Ollama endpoint locality is derived from HTTP loopback, not a model name or chip.
Fresh /api/show verification refuses cloud names/remote_host/remote_model/missing
local weight metadata. This trusts daemon responses: localhost may be a proxy or
malicious daemon. Loopback endpoints do not prove the daemon never uses a network.
Runtime discovery for llama.cpp/LM Studio is metadata-only, not an inference adapter.

Local studio runs require verified local Ollama. Explicit local context and offline
mode refuse cloud providers. Offline/local-only gates cover AI provider traffic,
not every network action elsewhere in the app or an already-running user's daemon.
General plain chat may use explicitly saved routing order/models. Cloud routing
requires cloud consent, rejects tool/image/native-context auto-routing, and refuses
fallback after any event or consent/auth/context error. A saved cloud route can send
plain chat to its configured cloud provider before any result; this is not silent
local processing. Provider/model provenance must reflect the actual provider.

Cloud consent starts unchecked/denied, is separately stored, checked per request,
and revocation aborts tracked cloud work and refuses accepting output after revoke.
File read/write approvals are separate from provider consent. Review proposals are
not writes/approval; builders own revision-safe accept and undo. Context switches
exclude chosen source classes; estimates are not model tokenizers. No claim that
all secrets are filtered from user-selected prose or model output.

## Storage, logs and cancellation

Templates/comparison/evaluation history may contain private prompt/output text in
local browser storage. Local privacy controls inspect/export/delete those stores;
exports are user-controlled files. Settings and consent are persistent preferences.
Desktop API keys/account tokens use native credential boundaries; browser-mode keys
are process memory, not exported preference text. Never paste keys into prompts.
Metadata cache is in memory, copied and endpoint-bound, not automatic inference.

Voice jobs use private local scratch files and cleanup/owner checks in source.
Source code is not proof of packaged permissions, orphan cleanup or isolation on
all targets. Cancel aborts owned requests/jobs, not guaranteed shared-daemon unload
or instantaneous physical deletion. Saved history/export files are separate from
cancel. Diagnostics are local redacted buffers/explicit exports; redaction isn't
proof that arbitrary private strings can never appear in error reports.

The current voice-releases.json contains no release records, so release() has
no matching real asset: so helper download/run is blocked, not a shipped working Whisper
feature. Source asset-download code describes the gated future path only.

## Audit sources and regression boundary

- providers/ollama.ts, localModels.ts, localCapabilities.ts, privacy.ts: endpoint,
  metadata/locality checks, consent/abort guards.
- providerRouting.ts (ROUTE_PROVIDERS), providerAuth.ts (AUTH_ENDPOINTS),
  panelBridge.ts factories, openAI.ts/openRouter.ts/providers/claude.ts: provider
  selection, actual identity, cloud transport and source-context guards.
- localModelManager.ts and src-tauri/src/local_models.rs: explicit pull/delete,
  local metadata endpoints, redirect/proxy rejection for native metadata reads.
- localComparison.ts/localEvaluation.ts/localQualityProbes.ts/localPrivacy.ts:
  test inputs, history storage and local export.
- voiceInput.ts/nativeVoice.ts/voicePreview.ts and src-tauri/src/local_voice.rs:
  explicit audio lifecycle, optional jobs/downloads/cleanup source evidence;
  voice_helper.rs holds release/asset gates, provider_transport.rs fixed cloud URLs.
- officeLocalPrompt.ts/officeReviewContract.ts/designLocalPrompt.ts/localSearch.ts/
  pushToTalk.ts/localModelRanking.ts: pure prep only; no provider traffic.

Paths above are under phase1/src/lib/agent unless otherwise stated. No single
production provider registry exists: the routing list, factory and auth map are
scanned together. localProviderBoundary.test.ts requires exact coverage of current
registered IDs and checks every local-labelled concrete provider's inference/auth
endpoint using an independent URL predicate. It also checks remote/custom Ollama
classification. Constructors do no I/O; test performs no network.

This regression catches endpoint/label drift, not all request URLs, native binaries,
redirects, daemon egress or external asset dependencies. Factory source presence is
a guard against unmapped coverage, not AST-proof of every possible future branch.
Native/Rust/WASM/full desktop E2E and packet-level/privacy attestation are CI or
separate audit work, not executed in this slice.

Roadmap-Delta: one data-flow source of truth and endpoint-registry regression;
remaining proof includes packaged network/asset/daemon isolation, actual native
accept/undo, and per-feature user-reviewed context/provider behavior.

## Slice validation

Two endpoint-boundary tests and 481 Agent/provider tests pass. DS/command manifest/
UI command inventory pass. Layers passes 1665 modules/5963 dependencies with its
existing missing compiler/87 ignored/4 stale warnings. Unfiltered typecheck still
fails only on missing generated slides-engine/pkg/somnia_slides.js. No native or
full-app E2E executed. Existing tests unchanged; production/provider behavior unchanged.
