# Authentication implementation

Status: audited API-key baseline; OAuth requirements below are a pending integration
contract, not an implementation claim. Source commit is in [README](README.md).

## Current source map

| Responsibility | Source |
| --- | --- |
| Connection UI and replacement flow | `phase1/src/components/agent/ProviderAuthentication.tsx` |
| Input validation, check and error mapping | `phase1/src/lib/agent/providerAuth.ts` |
| Renderer/native transport adapter | `phase1/src/lib/agent/nativeProviderFetch.ts` |
| Native IPC, credential store and HTTP | `phase1/src-tauri/src/desktop.rs` |
| Exact endpoint allowlist | `phase1/src-tauri/src/provider_transport.rs` |
| Non-secret preferences | `phase1/src/lib/agent/settings.ts`, `phase1/src-tauri/src/agent_settings.rs` |
| Cloud opt-in and abort tracking | `phase1/src/lib/agent/privacy.ts` |

## Current request flow

```text
User enters candidate -> metadata check through consent gate -> fixed provider endpoint
    -> check succeeds -> native OS-store write -> UI clears candidate input
Later request -> consent gate -> native IPC -> OS-store lookup -> fixed endpoint
    -> bounded native stream -> renderer receives response, not stored credential
```

The desktop flow is not the browser-preview flow. Preview uses a session-key map
and browser fetch. A newly pasted candidate crosses renderer memory and IPC even
on desktop. No stored-key getter is exposed by the inspected implementation.

## IPC contract in the baseline

Names are native commands, not public network endpoints. Calls originate from the
trusted `main` window. The native window-label check is necessary but does not
protect against malicious code already running in that renderer.

| Command | Input | Result / behavior |
| --- | --- | --- |
| `agent_key_status` | `provider` | Boolean presence; credential-store errors fail closed |
| `agent_key_save` | `provider`, `apiKey` | Validate then write provider's key |
| `agent_key_delete` | `provider` | Delete; already absent is success |
| `agent_settings_load` | none | Preferences; `apiKey` remains empty |
| `agent_settings_save` | `settings` | Non-secret preferences only |
| `provider_http_start` | `provider`, `url`, `method`, optional `body`, optional `candidateKey` | Response ID, status and selected safe headers |
| `provider_http_next` | `id` | Next bounded chunk, end or safe error |
| `provider_http_cancel` | `id` | Abort and remove native response |

Native cloud requests disable proxies and redirects. TLS verification is not
bypassed. Candidates are accepted only for the fixed authentication metadata
routes, never inference. The provider determines the credential/header type.

Limits inspected in `desktop.rs`: request body 2,000,000 bytes, key validation limit
8,192, connect timeout 15 seconds, HTTP/request lifetime 120 seconds, maximum four
active responses, maximum chunk 1,000,000 bytes and next-chunk timeout 30 seconds.
The UI metadata check has a separate 12-second default timeout. These are implementation
limits, not provider service guarantees.

## Network endpoints in the baseline

| Provider | Metadata authentication check | Native generation |
| --- | --- | --- |
| OpenAI API | GET `https://api.openai.com/v1/models` | POST `https://api.openai.com/v1/chat/completions` |
| Anthropic Claude API | GET `https://api.anthropic.com/v1/models?limit=1` | POST `https://api.anthropic.com/v1/messages` |
| OpenRouter | GET `https://openrouter.ai/api/v1/key` | POST `https://openrouter.ai/api/v1/chat/completions` |
| Local Ollama | GET `http://127.0.0.1:11434/api/tags` | Separate local adapter, not this native cloud broker |

The allowlist additionally permits OpenRouter model discovery and bounded Anthropic
model pagination. OpenAI and OpenRouter use Bearer keys; the native Claude branch
uses `x-api-key` plus `anthropic-version: 2023-06-01`.

## Credential lifecycle in the baseline

API keys use keyring service `de.philipp-paulik.somnia.agent`, with provider as the
entry username. Supported stored providers are `openai`, `claude`, `openrouter`.
Store operations run off the async thread under an in-process settings mutex.
There is no OAuth token refresh, generation journal, multi-account mapping or
remote revocation in this implementation. Do not describe it as a transactional
cross-process credential manager.

The UI tests a candidate before replacing a saved key. Non-secret preference save
is a separate operation. A successful metadata check alone does not establish that
the key was written, preferences were saved or inference succeeded. Delete is
idempotent locally; remote key revocation is the user's separate action.

## Account OAuth: pending flow

**TODO - implementation and research required.** Populate the sequence and exact
values only after inspecting the delivered account-auth code and dated policy
research. Do not borrow Codex's client registration or import its credential files.

```text
Explicit sign-in -> native pending transaction -> system browser authorization
    -> validated callback -> native token exchange/identity validation
    -> secure token-set persistence -> sanitized connection summary
Request -> consent + connection checks -> serialized refresh if needed
    -> allowed inference endpoint -> normalized response
Disconnect -> stop work -> remote revocation attempt -> local token removal
    -> honest local/remote outcome
```

The diagram is a required design sequence, not proof these operations are built.

### Evidence to fill in

| Item | Required evidence |
| --- | --- |
| Provider route and distribution eligibility | Dated official provider docs and research conclusion |
| Authorization, token, discovery, JWKS, revocation and inference endpoints | Code constants matched to official docs; exact method/origin |
| Client ID and registration ownership | Somnia-specific registration and supported bootstrap behavior |
| Redirect | Exact bind address, port rules, callback path and cleanup behavior |
| PKCE/state/nonce | Entropy source, one-use/timeout handling and callback validation tests |
| Identity | Issuer, signature, audience, subject, expiry and nonce checks actually implemented |
| Scopes/resource | Requested vs granted permissions and inference entitlement |
| Persistence | Namespace, token-set schema, OS backend and failure behavior |
| Refresh | Response expiry, serialization, rotation, terminal errors and recovery |
| Disconnect | Local deletion vs confirmed remote revocation; retained metadata |
| Transport | Account mode isolated from API-key billing and private endpoints |
| UI/IPC | Exact implemented labels, command names and sanitized reply types |

### Adding another OAuth provider

1. Verify that the provider permits this app, distribution and use. A working login
   or an open-source example is not permission to reuse another client identity.
2. Define a separate auth mode and fixed origin/path configuration. Never let
   project, model, extension or MCP content select credential destinations.
3. Implement native authorization, callbacks, identity validation, token storage,
   refresh and cancellation. No renderer token getter, generic authenticated fetch
   or silent plaintext fallback.
4. Bind conversations and model selection to the authenticated connection and
   billing path. Do not silently switch accounts or fall back to paid API usage.
5. Keep login authorization separate from cloud project-context consent. Successful
   OAuth must not initiate automatic generation or send project files.
6. Normalize safe errors and redaction; never log raw callbacks, codes, tokens,
   request headers or provider error bodies that might echo credentials.
7. Use deterministic fixtures for denial, wrong state/nonce, expired callback,
   token rotation, storage failure, disconnect during refresh and stale responses.
   Use `node:test` / `tsx --test`, not Vitest. No live paid inference in this task.
8. Document each new dependency's exact version/license and test packaged OS stores
   before calling the connection production-ready.
