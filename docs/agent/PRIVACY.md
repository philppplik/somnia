# Agent privacy and transparency boundary

Base: `56e2732` (`phase1-foundation`). These are product safeguards, not certification or a claim of full GDPR / EU AI Act compliance.

## Integration contract

Use `runWithProviderConsent({provider, endpoint, processing}, async signal => { ... }, callerSignal)` from `phase1/src/lib/agent/privacy.ts` for **every** provider request, retry and tool-loop turn. Pass `signal` to the transport. Consume the entire stream inside the callback: returning a reader early ends abort tracking. Disable redirects (`redirect: 'error'`) and use the exact supplied destination. A callback is not permission to change endpoints.

All unknown providers, OAuth/subscription-backed providers and remote Ollama require cloud consent. Only Ollama with an explicit HTTP loopback endpoint (`localhost`, `127.0.0.0/8`, `[::1]`) **and** `processing: 'local'` can bypass it. The adapter must verify the actual selected model is local before supplying that value. Never derive it from the URL, provider name, user input or model output. Cloud-backed Ollama models and proxies need `processing: 'cloud'`; unknown model locality must stay denied without consent. This guard does not itself query the Ollama model registry. Incorrect adapter classification is a release blocker.

Render `AgentConsentNotice` before the first cloud request. The checkbox starts unchecked. Do not auto-replay a previous prompt after consent; let the user press Send again. Declining must not block editing or verified local Ollama.

Render `AgentErrorNotice` permanently outside the panel's scrolling chat. Render `AIGeneratedLabel` on assistant messages and proposed/applied changes, including local-model content. Attach `createAIProvenance` metadata to persisted messages and changes. Human review does not erase AI provenance. DOM attributes and JSON metadata are **not** proof of adequate machine-readable marking for exported content under Article 50(2). Export/publication marking remains a release gate; do not add unsolicited code comments.

Settings > AI privacy allows withdrawal and fresh opt-in. Withdrawal is deliberately outside the Settings Undo stack: Undo must not silently restore permission. Withdrawal aborts guarded calls and rejects late output. It cannot retrieve already transmitted data or guarantee the provider stops processing it.

## Scope and assumptions

The current disclosure covers cloud providers the user chooses and their model providers. The record contains a disclosure version and approval timestamp, not provider/route-specific evidence. Provider- and route-scoped informed consent is a **release gate**: show actual selected providers and their policies, record consent scope, and require renewed confirmation when the destination or processing purpose materially changes. The generic OpenRouter guidance link is not a complete model-specific provider-policy list.

Consent is stored in this app profile, never remotely by this module. Missing, corrupt, outdated or unavailable storage denies cloud access. Cross-window storage events synchronize withdrawal. Changing the disclosure requires a version bump. Local storage is not tamper-proof evidence of informed consent. If persistence fails, this session remains denied; the UI must report this clearly and re-check after restart.

This is a boundary library, not a network sandbox. Provider, harness and native adapters must use it. It does not govern unrelated extensions, MCP servers, child processes or terminals. Those need separate destination-aware permission and disclosure checks. Subscription sign-in is not cloud-transfer consent. Context review, secret exclusion, API-key storage and chat-history retention belong to other modules and must be verified in the integrated build.

EN source and DE/ES/FR/PT-BR consent wording are provided. Non-English language and legal review remain necessary. Provider links are fixed reviewed URLs, never model-supplied destinations.

## Validation

Core tests cover default-deny, corrupt/versioned consent, local endpoint restrictions, unknown/cloud Ollama classification, opt-in persistence, withdrawal/regrant, abort propagation, late-output rejection, storage failures, caller cancellation, cross-window synchronization, provenance and locale completeness. Browser tests cover unchecked opt-in, grant, withdrawal, reload, German translation, keyboard interaction and small-window rendering. The Settings icon-count test is updated for the new privacy section.

## Sources inspected on 2026-10-06

- OpenAI EU policy: https://openai.com/policies/eu-privacy-policy/
- Anthropic Privacy Center (commercial and consumer policies): https://privacy.claude.com/en/
- OpenRouter policy: https://openrouter.ai/privacy
- OpenRouter provider routing/data collection: https://openrouter.ai/docs/guides/privacy/data-collection
- European Commission Article 50 guidance: https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act

The Commission treats interaction disclosure and machine-readable output marking as distinct obligations. AI badges and error warnings alone are not full compliance. Legal roles, GDPR lawful bases, transfer safeguards, third-party data rights, contracts and output marking need assessment before release.

## Delivery status

This branch supplies guard, Settings controls, reusable panel notices, provenance helpers and policy draft. The Agent panel and provider harness are parallel workstreams, so their use of the guard, output labels and permanent warning is not verified here. The site draft is not published. Full end-to-end provider/network verification must run after integration; no live API calls were made during these tests.

The parallel Ollama adapter's `verifyLocalModel` is expected to fail closed for unknown/cloud models and unavailable/invalid model metadata. Its positive result means **the configured daemon reports local model weights**, not independently verified local-only processing. A local proxy can forge `/api/show`; this module cannot detect that. Never advertise local processing as cryptographically proven or immune to a malicious local daemon.
