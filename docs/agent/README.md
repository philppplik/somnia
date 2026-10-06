# Somnia Agent documentation

Somnia Agent is the planned native AI panel for bounded project work and reviewed file changes. These documents describe the intended design and integration requirements. They are not a release announcement or proof of completed implementation.

- [Concept](CONCEPT.md): product promise, panel flows, context, review, errors and acceptance criteria. English edition of the supplied concept, updated for the later provider and design direction.
- [Architecture](ARCHITECTURE.md): Core/Provider/Panel/Diff/privacy boundaries, existing editor integration points and proposed contracts.
- [Providers](PROVIDERS.md): OpenRouter, local/remote Ollama and researched subscription-auth options.
- [Privacy and AI transparency](PRIVACY.md): draft opt-in, recipient disclosures, safeguards and EU AI Act review gates.

Baseline: `phase1-foundation` at `56e2732148d367209b81b65840aeeadebc43027c` (Somnia 10.3.0), 6 October 2026. Component contracts and privacy implementation are being developed on separate `agent/*` branches. Reconcile those contracts before integration; these pages do not certify that any guard, provider or reviewed-edit path is shipped.

MCP and Agent Client Protocol integration planning is a separate workstream. ChatGPT sign-in has an officially documented eligible open-source path, still pending implementation checks. Claude Pro/Max third-party OAuth is not permitted under the checked policy; use legitimate API/provider routes instead. See the provider page for sources and limits.

Core rule: propose first, accept into the editor after review, save separately. AI can make mistakes. Cloud processing requires explicit opt-in and approved context.
