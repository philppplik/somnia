# Provider integration, 11.2.0-beta.1

Implemented: OpenAI Chat Completions and Anthropic Messages with text + client tool rounds, manual model ID or explicit catalog refresh, provider-neutral token batching, partial-response labels, explicit user Retry, separate OS credentials, metadata-only auth tests. No paid inference was performed during development. Cloud consent gates calls and streams; no automatic failover.

Desktop cloud requests use Rust reqwest, fixed HTTPS routes, no redirects, no ambient proxy, bounded requests/chunks, a single-slot channel and cancellable response handles. Saved keys are resolved in Rust; the editor receives only a non-secret transport marker. Newly entered replacement keys pass through the editor password field for an explicit metadata test/save, but saved keys are not loaded back into it. The old OpenRouter OS entry is retained. New provider credentials use their own accounts under the same service.

Current limitations: 120-second total request timeout, 30-second idle stream timeout, up to four active response handles, no custom cloud endpoints/proxy. An abort before HTTP headers arrive cannot cancel the pending native start immediately; its client timeout bounds it and the response is cancelled on return. Not a remote-backend isolation guarantee: the trusted editor can ask the native host to make authorized endpoint requests. Consent is enforced by application logic, not a separate OS permission boundary.

Claude uses no subscription login and fails closed for thinking/server-tool content. Existing snapshots do not preserve those native blocks. OpenAI uses the compatibility Chat Completions adapter; Responses/reasoning-native formats are future work. Model catalogs include models that may not support this tool contract. No model ID, access, budget, subscription entitlement or pricing is hardcoded as a promise.

Concept docs are proposals, not implemented feature claims. In particular, the Responses API, full reasoning-block history, multiple connection profiles, scoped workspace selectors, provider-specific cloud grants, OAuth and paid model evaluations are not delivered in this beta. No ChatGPT or Claude subscription login is advertised.

Local offline tests cover real adapter contracts, auth, prompt persistence, streaming, errors and allowlisted routes. Real OS credential unlock dialogs, native HTTPS streaming against actual providers and macOS/Windows interactive acceptance remain unverified. CI builds native targets and the ad-hoc signed DMG; no notarization is added.
