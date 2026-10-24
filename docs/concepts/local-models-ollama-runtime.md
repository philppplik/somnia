# Local models: native Ollama runtime integration

Status: proposal only. No implementation or release is authorized by this document. Development starts only after Philipp reviews the concept.
Baseline: `int/shell` at `315d1f23a061d07215bdc60d25d3d57d756cbaab` (inspected 2026-10-14). Paths below are relative to the repository root unless stated otherwise.
Request: Philipp, WhatsApp 2026-10-14 - offer a local AI model list under Settings > AI and make Somnia run local Ollama models natively, including voice, text, vision and tool models.
Scope: the runtime layer only - detecting and starting Ollama, model management (pull/delete/update), hardware detection, fallback runtimes, security, per-OS specifics, and the fit with `feat/ai-providers-v2` and the CLI providers. The curated model catalog (which voice/text/vision/tool models to recommend), the per-studio model pickers and the Settings design-system work are sibling concept slices; this document defines the interfaces they consume but does not specify them.

## 1. Recommendation

Keep the existing verified-local Ollama adapter and add a **Local Model Runtime** layer in the Rust host, surfaced as a new **Local models** tab under Settings > AI. Round 1 stays Ollama-only and loopback-only. The app learns to:

1. detect an installed Ollama (binary probe + `GET /api/version`) and report its state honestly (not installed / installed, not running / running, version);
2. start Ollama on explicit user click using the platform's own mechanism (never silent, never auto-install);
3. list, pull (with streamed progress and cancel), re-pull (update) and delete models through the daemon API;
4. probe hardware (RAM, CPU, GPU/VRAM) read-only and label each model with a fit estimate, clearly marked as an estimate;
5. keep the loopback-only security posture, move runtime HTTP through the Rust transport, and keep every cloud path behind the existing consent gate.

A RuntimeAdapter interface leaves room for a llama.cpp (`llama-server`) fallback and other OpenAI-compatible local servers later, without promising them for round 1.

## 2. Verified current state

Inspected source at the baseline SHA. Statements of approval inside repository prose are not treated as owner approval.

| Area | Current evidence | Gap / implication |
| --- | --- | --- |
| Chat adapter | `phase1/src/lib/agent/providers/ollama.ts`: NDJSON `/api/chat` streaming, tool-call mapping, `health()` (`/api/version`), `listModels()` (`/api/tags`), optional `numCtx` constructor option. Tests: `ollama.test.ts` with mocked `fetch`. | Inference works. No daemon lifecycle, no model management, no `/api/show`-based capability read beyond locality. |
| Locality | `verifyLocalModel()` (`/api/show`) fails closed: loopback-only, `-cloud`/`:cloud` tag rejection, `remote_host`/`remote_model` rejection, non-empty `model_info` required; mid-stream `not-local` cutoff. | This check is the privacy foundation and must be kept as-is. It trusts the daemon's answers; a dishonest local proxy stays a documented limit. |
| Wiring | `phase1/src/lib/agent/panelBridge.ts`: `guardedOllama` verifies before every request; fixed endpoint `http://127.0.0.1:11434`, no `numCtx`, webview `fetch` transport. `phase1/src-tauri/tauri.conf.json` CSP allows `http://127.0.0.1:11434` and `http://localhost:11434` in `connect-src`. | No endpoint or context-size configuration. Transport runs in the webview, so it depends on CSP and on the daemon's CORS behaviour toward the webview origin (unverified on a packaged build, see section 8). |
| Model list UI | `phase1/src/lib/agent/modelCatalog.ts`: `listProviderModels('ollama')` maps `/api/tags` into Settings > AI > Providers "Refresh models" suggestions. `phase1/src/components/agent/AgentSettings.tsx` tabs: `providers`, `instructions`, `privacy`, `tools` (MCP). | A suggestion dropdown, not a management surface. Philipp's requested "local model list" is a new tab, not an extension of this dropdown. |
| Settings mechanics | `docs/ai/SETTINGS-MIGRATION.md`: Settings > AI is the only persistent AI configuration surface; the form is a draft until "Save AI settings"; saving starts a new core session. | Runtime actions (start daemon, pull, delete) are immediate operations, not draft settings; the tab must visually separate the two. |
| Rust host | `phase1/src-tauri/Cargo.toml`: `reqwest` (rustls) and `tauri-plugin-process` already present. `phase1/src-tauri/src/mcp_broker.rs` shows the sanctioned spawn pattern: policy-checked `Command`, consent, fail-closed. `phase1/src-tauri/capabilities/editor.json` grants `process:allow-restart` only; no shell/exec for the webview. `nativeProviderFetch.ts` + `allow-provider-http-*` capabilities show the existing native-transport pattern for cloud providers. | No `sysinfo`-style hardware crate yet. Process start for a third-party app needs a new, narrow, explicitly permitted path; the MCP broker pattern is the precedent. |
| CLI | `docs/cli/usage.md`: `SOMNIA_ENGINE_PROVIDER=ollama`, `SOMNIA_ENGINE_MODEL`, `SOMNIA_ENGINE_OLLAMA_URL` (default `http://127.0.0.1:11434`), `SOMNIA_ENGINE_CLOUD_CONSENT=1` required for cloud providers *and non-loopback Ollama URLs*. Engine runs as a TS sidecar (`phase1/cli/src/engine.rs`); credentials never cross the protocol. | CLI already shares the loopback-default, consent-for-remote semantics. It assumes a running daemon and has no lifecycle management. |
| Provider concepts | `docs/agent/decisions/PROVIDER-ARCHITECTURE-UX.md` (German): ProviderDefinition / ConnectionProfile / ModelDescriptor / RunSnapshot; locality never from URL alone. `docs/agent/ollama-provider.md` and `PROVIDERS.md` on `feat/ai-providers-v2`. | The runtime layer slots into these objects (section 7); it does not replace them. |

## 3. Proposed architecture

### 3.1 RuntimeAdapter (Rust host)

One trait, Ollama first. All operations carry an explicit caller intent; none run on a timer.

```rust
trait RuntimeAdapter {
    fn detect(&self) -> RuntimeDetection;      // binary probe + install location, no network
    fn status(&self) -> RuntimeStatus;         // GET /api/version, ~2 s timeout, never throws
    fn start(&self, mode: StartMode) -> Result<StartOutcome>;  // user-initiated only
    fn list_models(&self) -> Result<Vec<LocalModel>>;          // GET /api/tags
    fn show(&self, model: &str) -> Result<ModelDetail>;        // POST /api/show
    fn running(&self) -> Result<Vec<RunningModel>>;            // GET /api/ps (size_vram, expires_at)
    fn pull(&self, model: &str, progress: Sender<PullProgress>) -> Result<()>;  // POST /api/pull, NDJSON
    fn delete(&self, model: &str) -> Result<()>;               // DELETE /api/delete
}
```

- `detect()` checks, per OS, the binary on `PATH` and the standard install locations (section 6), without executing anything. Result feeds the tab's state card.
- `start()` is the only side effect beyond HTTP, and only fires from an explicit "Start Ollama" click. Per OS it uses the platform mechanism (open the app / start the service); it never downloads or installs Ollama. If no install is found, the tab shows a manual install guide link (https://ollama.com/download) - Somnia does not become an installer in round 1.
- `pull()` streams the NDJSON progress (`status`, `digest`, `total`, `completed`) to the UI over IPC events; cancel aborts the HTTP stream. Ollama resumes interrupted pulls, so cancel is safe to offer. Re-pulling an installed tag is the update path (the daemon pulls changed layers in place); the UI labels it "Update".
- Sketch only; final types are decided in implementation.

### 3.2 Settings > AI > Local models (new tab)

Extends the existing tab list (`providers`, `instructions`, `privacy`, `tools`) with `local-models`. Content:

1. **Runtime card**: state (not installed / installed, not running / running), daemon version from `/api/version`, endpoint (fixed `http://127.0.0.1:11434` in round 1), and one action button matching the state (Install guide / Start / Running - no action). No auto-polling storm: one probe when the tab opens plus a manual Refresh; a single re-check after Start.
2. **Hardware card** (from section 5): RAM total/free, CPU, GPU name + VRAM when detectable. "Fit" labels are estimates (section 5.3).
3. **Installed models table**: name, parameter size, quantization, family (`details` from `/api/tags`), disk size, capabilities from `/api/show` (`completion`, `vision`, `tools`, `embedding`, `thinking` - shown as badges), running state + VRAM from `/api/ps`, and row actions Update / Delete. Delete asks for confirmation and names the freed space.
4. **Pull flow**: a search field fed by the sibling catalog slice; until that lands, a plain "Pull by name" input with the exact `ollama.com/library` name. Progress bar with cancel. Free-disk check against the expected download size before starting (catalog-provided size; when unknown, pull anyway and say so).
5. **Advanced** (collapsed): context size (`num_ctx`, maps to the adapter's existing `numCtx`), keep-alive hint (`keep_alive` per request; daemon default 5 min). Both labelled "advanced", neither advertised as a guarantee - Ollama may clamp `num_ctx` (documented in `ollama-provider.md`).

Immediate runtime actions (Start, Pull, Update, Delete, Refresh) execute at once with their own confirmations; only `num_ctx`/keep-alive are draft settings under the existing save flow.

### 3.3 Transport: move Ollama HTTP into the Rust host

Today the webview fetches the daemon directly (CSP-listed). The runtime's management calls and, later, chat should go through `reqwest` in Rust behind narrow IPC commands, following the existing `allow-provider-http-*` capability pattern. Benefits: no dependence on the daemon's CORS behaviour toward the packaged webview origin (an open verification item in `ollama-provider.md`), one place for timeouts and size limits, and no CSP widening when endpoints change. The existing webview adapter stays the contract owner; the transport swap keeps `verifyLocalModel` semantics unchanged (same fields, same fail-closed rules).

## 4. Security

Round-1 posture: **loopback only, verify every time, no silent installs, no silent configuration writes.**

- Endpoint allowlist stays loopback (`localhost`, `127.0.0.0/8`, `::1`, http only), enforced by the existing `normalizeBaseUrl` + locality derivation. A remote Ollama is not a "local model": it goes through the cloud consent path, as the CLI already models with `SOMNIA_ENGINE_CLOUD_CONSENT`.
- `verifyLocalModel` remains mandatory before every inference request, including for models pulled through the new UI. Pulling is not verification.
- Somnia never sets `OLLAMA_HOST` to a non-loopback value and never edits `~/.ollama/server.json`. The FAQ documents `OLLAMA_NO_CLOUD=1` / `disable_ollama_cloud` as the user's own local-only switch; the tab may *show* whether cloud features are disabled (when detectable) but must not flip it silently.
- Process start follows the MCP broker precedent: fixed, policy-checked command, no shell interpolation, fail-closed. The webview gets no generic spawn capability; one IPC command per action.
- Pulls download executable-format model weights from the public ollama.com registry through the daemon's own TLS. Somnia shows the source (`ollama.com/library/<name>`) and never passes the API's `insecure` flag. Digest pinning is out of round 1.
- Trust boundary, stated honestly: any local process can answer on port 11434. The daemon's self-report is not proof of local processing (already documented in `ollama-provider.md`). The runtime layer does not weaken this; it also cannot fix it.
- Untrusted project content must never change the endpoint or trigger pulls - same rule `PROVIDERS.md` already sets for provider configuration.

## 5. Hardware detection

Read-only, one-shot probes, run when the tab opens and on Refresh. No background monitoring in round 1.

### 5.1 RAM / CPU

Add the `sysinfo` crate (new dependency, flagged for Philipp's OK) or use per-OS reads. Total and available RAM drive the fit estimate. CPU brand and core count are display-only.

### 5.2 GPU / VRAM (per OS, all best-effort and unverified on real hardware here)

| OS | Probe | Notes |
| --- | --- | --- |
| Windows | PowerShell CIM `Win32_VideoController` (name, AdapterRAM) as a first pass; DXGI via the `windows` crate as the accurate path | `AdapterRAM` truncates above 4 GB; treat as lower bound. NVIDIA: `nvidia-smi` when present gives exact VRAM. |
| macOS | `system_profiler SPDisplaysDataType -json` | Apple Silicon uses unified memory: show total RAM and mark VRAM as "shared". Ollama uses Metal by default on Apple Silicon. |
| Linux | `/sys/class/drm/card*/device/{vendor,device}` and `mem_info_vram_total`; `nvidia-smi` / `rocm-smi` when present | lspci needs no root but may be absent; degrade to "GPU unknown". |

Unknown is a displayed state, never guessed away. The daemon's own choice wins: `/api/ps` `size_vram` shows whether a loaded model actually sits in VRAM, which is more truthful than any pre-flight estimate.

### 5.3 Fit estimate

Label per installed or catalog model: "fits in VRAM" / "fits in RAM (slower)" / "likely too large" / "unknown". Basis: model file size (`/api/tags` `size`) plus a context allowance against free VRAM, then free RAM. Shown as an estimate with a tooltip; speed numbers are never promised. The sibling catalog slice owns recommended sizes per capability; the runtime only supplies the measurements.

## 6. Per-OS specifics

| Topic | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Install locations probed | `%LOCALAPPDATA%\Programs\Ollama\ollama.exe`; `ollama.exe` on `PATH` | `/Applications/Ollama.app`; `ollama` on `PATH` (Homebrew) | `/usr/local/bin/ollama`, `/usr/bin/ollama`, `PATH` |
| Start mechanism (user-clicked) | Launch the installed app (`ollama app` / exe start); tray app runs the server | `open -a Ollama`; menubar app runs the server | `systemctl start ollama` needs elevated rights - Somnia cannot do this unprivileged. Offer the command to copy plus a Re-check button; `ollama serve` as a visible fallback would tie the daemon's life to Somnia's process, so it is not the default. |
| Service model | User-session tray app, auto-update via "Restart to update" | User-session menubar app, auto-update via "Restart to update" | systemd system service (`ollama.service`), update by re-running the install script |
| Models directory (display only) | `C:\Users\<user>\.ollama\models` | `~/.ollama/models` | `/usr/share/ollama/.ollama/models` (service user) |
| Env configuration (user docs only) | User env vars + app restart | `launchctl setenv` + app restart | `systemctl edit ollama.service` |
| Code signing notes | Ollama's own installer is signed; Somnia only launches what is already installed | Gatekeeper handles Ollama.app; nothing extra for Somnia | Distro packages vary; probe, don't assume |

Env-var documentation lives in the user guide, not in-app editing UI, in round 1.

## 7. Fit with ai-providers-v2 and the CLI

**ai-providers-v2** (`docs/agent/decisions/PROVIDER-ARCHITECTURE-UX.md`):

- The runtime is a property of the Ollama **ProviderDefinition**, not a new provider. A **ConnectionProfile** for Ollama gains the daemon endpoint (loopback default) and the runtime state as inspected facts, never user-pasted secrets.
- **ModelDescriptor** gains a `capabilities` set read from `/api/show` (`completion`, `vision`, `tools`, `embedding`, `thinking`) plus size/family/quantization from `/api/tags`. This is the data the sibling catalog slice groups into Philipp's voice / text / vision / tool lists. Catalog presence remains no proof of agent quality - `PROVIDERS.md` already bans that claim.
- **inspectTarget** stays the locality authority; runtime management never bypasses it.
- Voice, honestly: Ollama today has no speech-to-text or text-to-speech generation API. `/api/embed` documents audio *input* for multimodal embedding models, which is not voice chat. Real voice (whisper.cpp-style STT, piper-style TTS) belongs to the fallback-runtime path (section 8) and the Sound-studio slice. Round 1 ships text, vision-input and tool models only; the tab must not advertise voice until a runtime actually provides it.

**CLI** (`phase1/cli`, `docs/cli/usage.md`):

- The CLI keeps its env-var configuration and already matches the proposed semantics: loopback default, consent required for non-loopback Ollama. No protocol change.
- Round 1 gives the CLI **no** daemon lifecycle: `somnia run` against a stopped daemon fails with the existing `consent`/`provider` error plus a "start Ollama" hint, it does not try to start services headlessly.
- Later, a `somnia models` read-only listing can reuse the same RuntimeAdapter code compiled into the CLI; flagged as a follow-up, not part of this concept.
- The desktop app and CLI can share one daemon; nothing in the runtime layer assumes exclusivity.

## 8. Fallback runtimes (later phases, interface-shaped now)

| Runtime | Status | Shape |
| --- | --- | --- |
| Ollama | Round 1 | Full RuntimeAdapter as above. |
| llama.cpp `llama-server` | Phase D candidate | Local binary, OpenAI-compatible `/v1/chat/completions` on a configurable loopback port. Adapter maps `list/pull` to "user manages GGUF files" - honest downgrade, not fake parity. Exact API compatibility is unverified here. |
| LM Studio / LocalAI / other local servers | Out of round 1 | Fit the future "custom OpenAI-compatible loopback endpoint" provider rather than the Ollama adapter; locality rules identical. |

The RuntimeAdapter trait (section 3.1) is the seam; each new runtime ships with its own verification doc like `ollama-provider.md`.

## 9. Per-studio awareness

The runtime is app-global; consumption differs per studio. Today only the Agent panel (Code and Photo documents) runs inference. The Local models tab shows capability badges (text / vision / tools / embedding) so each studio's future picker can filter correctly: Code's agent needs `tools`; Photos/Vector vision work needs `vision`; Sound voice work waits for a voice-capable runtime (section 7). Per-studio default models and pickers are the sibling catalog/settings slice; this document only guarantees the capability data exists and is truthful.

## 10. Testing and verification plan

- Extend the existing mocked-daemon tests (`phase1/src/lib/agent/providers/ollama.test.ts` style): NDJSON pull progress parsing across chunk boundaries, cancel mid-pull, delete 404, `/api/ps` shape, capability mapping from `/api/show`. No existing test is weakened; new behaviour adds tests.
- Rust unit tests for probe parsing (CIM JSON, `system_profiler -json`, `/sys` reads) with recorded fixtures.
- UI tests on the fixtures pattern from `docs/ai/SETTINGS-MIGRATION.md`: tab states (not installed / stopped / running), pull progress, delete confirmation, draft-vs-immediate separation.
- Owner-device validation matrix (cannot run in CI): Philipp's Windows PCs (install detection, Start button, pull of a small tool model, Agent run end to end), his Mac (Apple Silicon Metal path), a Linux VM (service-start fallback instructions). Each item checked off before the feature leaves beta.
- Explicitly unverified here: no live Ollama daemon was available while writing this; the packaged webview's origin vs `OLLAMA_ORIGINS` defaults (the FAQ documents cross-origin allowance from `127.0.0.1`/`0.0.0.0` only) is untested on a real build - another reason for the Rust transport in section 3.3; GPU probes are untested on real hardware; llama-server API compatibility is taken from its public description, not tested.

## 11. Phasing

| Phase | Content | Shippable alone |
| --- | --- | --- |
| A | Detection + status card + installed-models table (read-only), Rust transport for management calls | Yes: answers "do I have Ollama and what is on it". |
| B | Start button per OS, pull with progress/cancel, update, delete | Yes: Philipp's "run local models natively" without manual terminal work. |
| C | Hardware card + fit estimates, `num_ctx`/keep-alive advanced settings | Yes. |
| D | llama.cpp fallback, CLI `somnia models`, capability routing into studio pickers (with sibling slices) | Yes. |

## Sources

- Ollama API reference, fetched 2026-10-14: https://github.com/ollama/ollama/blob/main/docs/api.md (`/api/tags`, `/api/show` incl. `capabilities`, `/api/pull`, `/api/delete`, `/api/copy`, `/api/ps` incl. `size_vram`, `/api/version`, `/api/embed`)
- Ollama FAQ, fetched 2026-10-14: https://github.com/ollama/ollama/blob/main/docs/faq.mdx (default bind `127.0.0.1:11434`, `OLLAMA_HOST`, `OLLAMA_ORIGINS`, `OLLAMA_NO_CLOUD` / `disable_ollama_cloud`, model storage paths, per-OS env configuration, `OLLAMA_CONTEXT_LENGTH`, `keep_alive`)
- Ollama tool calling: https://docs.ollama.com/capabilities/tool-calling
- Repository docs at the baseline SHA: `docs/agent/ollama-provider.md`, `docs/agent/PROVIDERS.md`, `docs/agent/using-openrouter-and-ollama.md`, `docs/agent/decisions/PROVIDER-ARCHITECTURE-UX.md`, `docs/ai/SETTINGS-MIGRATION.md`, `docs/cli/usage.md`, `docs/cli/security.md`
