# Somnia Agent documentation

Somnia Agent is the native AI panel for bounded project work and reviewed file changes. It is implemented on the `somnia-agent` branch (OpenRouter and local Ollama providers, file tools, per-file approvals, hunk review, consent gate) and is still alpha: only fake providers are covered by automated tests, and no real provider run from the packaged app has been verified.

- [Architecture](ARCHITECTURE.md): modules, data flow of a turn, session, tools, consent and approvals, providers, panel, autosave hold, logging, known gaps, and the design requirements the code is held to.
- [Concept](CONCEPT.md): product promise, panel flows, context, review, errors and acceptance criteria.
- [Core](CORE.md): `AgentSession`, tools and provider contract as built on the core branch, with limits and sandbox rules.
- [Current authentication guides](../auth/README.md): inspected API-key implementation and pending account-OAuth work.
- [Authentication decision](AUTH-DECISION.md): API keys, official OpenAI plan OAuth, native credential boundary, validation, rotation and revocation. Design only.
- [Providers](PROVIDERS.md): OpenRouter, Ollama and researched subscription-auth options. [Ollama adapter](ollama-provider.md): wire format and local verification.
- [Privacy and AI transparency](PRIVACY.md): opt-in, recipient disclosures, safeguards and EU AI Act review gates. [Site privacy draft](PRIVACY-PAGE-DRAFT.md): unpublished text.
- [MCP and ACP](MCP-ACP.md): plan only, nothing implemented.

Related notes: [AGENT-INTEGRATION.md](../../phase1/notes/AGENT-INTEGRATION.md) (merge record), [AGENT-PANEL.md](../../phase1/notes/AGENT-PANEL.md), [AGENT-DIFF.md](../../phase1/notes/AGENT-DIFF.md). App-wide architecture: [../ARCHITECTURE.md](../ARCHITECTURE.md).

Claims about Claude Pro/Max third-party OAuth and ChatGPT sign-in follow the policy checks recorded in PROVIDERS.md; they are not implemented.

Core rule: propose first, accept into the editor after review, save separately. AI can make mistakes. Cloud processing requires explicit opt-in and approved context.
