# Provider authentication

Somnia uses BYOK. There is no Claude.ai / ChatGPT login, subscription-token reuse or OAuth implementation in this change.

## API contract

`src/lib/agent/providerAuth.ts` exports `AuthProvider`, `ProviderAuthError`, `hasProviderKey`, `loadProviderKey`, `saveProviderKey`, `deleteProviderKey`, `testProviderAuthentication` and `validateProviderKey`.

- Supported IDs: `ollama`, `openrouter`, `openai`, `claude`.
- Cloud keys use separate OS credential-store accounts under the existing service `de.philipp-paulik.somnia.agent`. Existing OpenRouter keys need no migration.
- Key presence is fetched for configuration, not the existing secret. Request-time adapters call `loadProviderKey(provider)`; loading normal settings never returns a secret. The renderer still receives a key for a request because the current adapters send HTTP from the renderer. Moving the entire transport into Rust is separate hardening work.
- Browser preview uses an in-memory map, never local/session storage. Reload forgets browser keys.
- Preferences save independently of credentials. Saving local-model preferences cannot delete a cloud key. The legacy `apiKey` settings DTO is sent/returned empty, never used for authentication.
- Tauri commands `agent_key_status/load/save/delete` are registered, allow-listed and gated to the trusted main window. All credential operations run in blocking workers and use the existing shared mutex.

## Connection test

Tests issue a single metadata GET with a 12-second timeout, cancellation, no redirects, no cookies, no referrer and no retries:

| Provider | Endpoint | Headers |
| --- | --- | --- |
| OpenRouter | `https://openrouter.ai/api/v1/key` | Bearer key |
| OpenAI | `https://api.openai.com/v1/models` | Bearer key |
| Claude | `https://api.anthropic.com/v1/models?limit=1` | `x-api-key`, `anthropic-version: 2023-06-01`, browser-access opt-in |
| Ollama | `http://127.0.0.1:11434/api/tags` | No key |

These calls do not request inference and send no prompt, chat or project content. Cloud tests require the existing explicit cloud consent; revocation aborts them and prevents accepting output. Local `/api/tags` proves connectivity only; normal inference separately checks the selected model's local metadata.

The UI retains a working key until a replacement passes its test and its store write succeeds. Failed tests cannot overwrite it. Delete works without contacting the provider and explains that deleting locally is not remote revocation. Invalid-key, network/CORS, timeout, cancellation, rate-limit, provider-unavailable, protocol and locked-store failures have fixed text. Provider error bodies are not read or logged. Account labels and balances are not returned. Successful validation does not promise inference credits or model access.

## Integration with adapter branches

This branch intentionally keeps the current AgentPanel provider options and `AgentConfiguration.provider` union unchanged. Advertising Claude/OpenAI before their runtime adapters are merged would route them to the existing OpenRouter fallback. The builder must combine the provider branches and then:

1. Change `AgentConfiguration.provider` to `AuthProvider` (type import from providerAuth).
2. Add `ClaudeProvider` from `./providers/claude` and `OpenAIProvider` from `./openAI` to panelBridge's provider selection. Each uses `getApiKey: () => loadProviderKey('claude'/'openai')`. Keep local Ollama gating and custom-prompt wrapping intact. Unknown IDs must not fall back to OpenRouter.
3. Add matching Claude/OpenAI choices to AgentPanel. Its generic ProviderAuthentication component already supports both IDs. Coordinate these edits with the provider UI branch.
4. Settings validators and production/development CSP already support both new providers in this branch.

## Validation and remaining checks

- 16 auth unit tests, including per-provider headers, response shapes, consent, revocation, timeout, cancellation, safe errors, isolation, rotation, deletion and locked OS-command mocks.
- Three Playwright auth tests use intercepted metadata responses, not real keys or paid inference.
- Existing AgentPanel E2E tests remain compatible.
- No Rust toolchain exists in the worker environment. Builder must compile the desktop and test real locked/unlocked Keychain, Credential Manager and Secret Service behavior. Browser mocks cannot prove these platform behaviors.
- Auth strings are English, matching the existing Agent configuration section. Translation into all app languages remains follow-up work.

## Verified reference docs

- https://openrouter.ai/docs/api-reference/api-keys/get-current-key
- https://platform.openai.com/docs/api-reference/models/list
- https://docs.anthropic.com/en/api/models-list
- https://docs.ollama.com/api/tags
