# Local AI security review, Phase AB

Ten deterministic injected-port tests cover the requested security boundaries.
They are defense tests, not a penetration-test certificate or proof against a
malicious daemon/OS. Model/file content never grants host permissions.

| Scenario | Result / smallest fix |
| --- | --- |
| File instructs shell/command execution, secret/out-of-scope reads or traversal write | Existing tool allowlist, file permissions and path checks refuse; no proposal/editor change |
| Model claims approval for an authorized write | Existing write tool only stages reviewable proposal; editor unchanged |
| URL credentials/query/fragment | GAP: provider normalized them away. Now rejected, never silently stripped |
| Non-loopback, metadata IP, misleading localhost, userinfo host, HTTPS or nested local API path | Existing localOrigin refuses. General provider may explicitly be remote but stays cloud/consent-gated, not local |
| Redirect to metadata IP | Existing redirect:error flag preserved; 302 never verifies local weights. Native source has no_proxy and redirect::none |
| Pull/delete URL, traversal, shell/control/encoded names | GAP: JS delete forwarded name without pre-IPC validation, and pull trimmed control characters. Validate before mutation, reject control chars; native registry guard remains |
| Oversized metadata, chat line, pull progress | Chat/pull limits already pass. GAP: provider metadata used unbounded json(). Add 2 MB bounded reader with owned body timeout/cleanup |
| Stuck metadata body after headers | GAP: initial get timeout stopped after headers. Bounded reader now owns body timeout and cancellation |
| Opaque secret in provider exception | GAP: pattern redaction cannot recognize arbitrary text. AgentSession logs taxonomy only, not raw exception |
| Opaque secret in tool permission callback | GAP: raw tool exception was logged. Fixed generic log and existing generic tool failure result preserve secrecy; subsequent model request contains no private error |
| Config API credential | Existing non-secret settings omit key; synthetic Ollama request body/header has no config key. Explicit user-authored prompt text remains user data, not auto-redacted |

The bounded metadata reader checks byte size before decoding/accepting, cancels
and releases its owned reader on every outcome. Metadata JSON failure stays
protocol/unknown, never a fallback. verify/capabilities/health/model-list paths
use it. Pull/delete use JSON fields, never shell interpolation. General remote
providers are not disabled by this patch; locality and normal consent still apply.

Tests: ten AB tests pass and the final broad Agent/provider suite passes (435).
Existing assertions unchanged. DS, command manifest/UI inventory and layers pass;
layers retains compiler/ignored/stale-baseline warnings at 1652/5933. Unfiltered
typecheck reports only missing generated slides-engine/pkg/somnia_slides.js.
Rust endpoint/action source reviewed: loopback origin, no proxy/redirect, registry
name/digest checks and bounded native responses already exist. No Rust/native,
real-network redirect test, full desktop/package E2E or WASM execution performed.

Roadmap-Delta: run malicious-daemon/native transport fixtures and packaged security
acceptance; audit other app logging paths separately. This patch prevents raw
AgentSession provider/tool-error disclosure, not every possible secret in arbitrary
user-authored text or unrelated diagnostics. Loopback metadata remains daemon trust,
not cryptographic locality evidence. No dependency, flags, permissions or budget
change, no UI strings requiring locale updates.
