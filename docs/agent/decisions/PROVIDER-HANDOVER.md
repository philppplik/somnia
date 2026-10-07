# Handover: Provider architecture / UX (concept part 4)

Base: somnia-agent / 467071380187a133eb90eb94e37963b0501ad480 (11.1.1-beta.1).
Local branch: docs/provider-architecture-ux. Documentation only, no implementation, push, PR, CI or paid inference.

Files: PROVIDER-ARCHITECTURE-UX.md (German decision document), PROVIDER-UX-CONCEPT.png (illustrative mockup), this briefing. All under docs/agent/decisions.

Integration: apply attached git-format patch on a builder-owned branch after checking current changes. No shared files changed, so no intended overlap with other concept parts. Review whether the three concept documents on auth/agent protocols/privacy refine consent or adapter types here. Subscription/OAuth/ACP policy decisions are explicitly out of scope of this part.

Core recommendation: retain AgentProvider/AgentSession, add profiles + registry + discovery + immutable run snapshots, move saved secrets and transport into native host, migrate v1 without losing prompt text or keys, no automatic history transfer on provider switch, failover off. Defaults/model IDs are not frozen public promises.

Notable current-code findings: OS key storage exists, but desktop load exposes key to React/JS; one global model field; discovery present only in Ollama and unused in panel; config save resets chat; global cloud consent not destination-scoped; current retry/token-doubling can create extra inference charges; custom prompt bytes are appended after core context check; provider docs have stale session-only key wording.

Validation: inspected source files at pinned base; 7 official documentation pages fetched. No runtime tests run because this is docs only. UTF-8/json fences checked, git diff --check. Actual pixels of the final PNG inspected: labels complete, columns and buttons readable, no clipping; annotated as concept, not current application.

Open decisions: direct API priority, durable local chat history, future opt-in retries/failover, multiple profiles in first UI iteration. None blocks document delivery. Actual native credential unlock, CORS/platform networking, model quality and paid provider entitlement remain untested.
