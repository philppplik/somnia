# Somnia Agent privacy and AI transparency

Status: DRAFT, 6 October 2026. Requirements and candidate copy, not a published privacy notice, compliance certification or proof of shipped safeguards. Reconcile this document with the implementation and website-notice draft on `agent/privacy` before release. Checked OAuth policy findings are summarized in [PROVIDERS.md](PROVIDERS.md); final integration and downstream-provider details are still pending.

## What local-first means

Project files live locally. Cloud AI still processes approved content outside the computer. The actual route may include OpenRouter, its selected inference provider, a direct provider or a separately enabled agent/tool service. A model/provider setting must not hide those destinations.

Local-only Ollama is an alternative when the daemon, model and route are verified local. Remote Ollama endpoints or cloud models are not covered by that exception. AI notices, file scope and manual review apply in either mode.

Do not claim that Somnia has no AI intermediary or that credentials use a particular secure store until the implementation verifies that claim. Do not call cloud requests "entirely local".

## Explicit opt-in and revocation

Before the first remote request, show clear AI identification and a separate, unchecked opt-in covering third-party processing. Name the selected route and explain that prompts, selected project content, relevant conversation and tool results may be transmitted. Link the applicable policies. Consent to one processing route is not blanket permission for every later tool or destination.

The implementation must:

- Block cloud provider calls without valid current opt-in, including retries, discovery/auth requests that expose private data and background calls.
- Check consent through one shared request guard immediately before transmission, not only when opening the panel.
- Version the disclosure and keep the stored scope/provider choices and acceptance time. Policy/destination changes require an appropriate renewed decision.
- Offer refusal without silently selecting a cloud fallback; explain the local-only alternative.
- Allow revocation in Settings. Prevent future remote requests; cancel active work where technically possible. Revocation cannot recall already sent data or guarantee remote processing has stopped.
- Keep data-processing opt-in distinct from permission to read project files, apply edits, execute external tools or save to disk.

App opt-in is a product control, not automatically the legal basis for all personal-data processing. Legal review must assess controller/processor roles, lawful basis, third-party agreements, international transfers and user obligations for material about other people.

### Candidate onboarding copy

> Somnia Agent uses AI and can make mistakes. Review proposed changes before accepting them.
>
> Cloud requests send your prompts and approved project context to the selected provider and disclosed downstream services. These services have their own privacy rules. Local-only Ollama requests stay on your configured local route when no cloud model or remote tool is used.

Unchecked choice:

> I agree to sending approved context to the selected third-party AI services for my requests.

Actions: "Agree and continue", "Use local-only Ollama", "Not now". Only show a local option as usable when it is actually configured. Do not make the checkbox appear preselected or treat dismissing the dialog as acceptance.

### Candidate Settings copy

"Cloud AI data sharing: enabled/disabled. Revoke to stop future cloud requests. Previously transmitted data may remain subject to provider policies."

Keep strings short, accessible and internationalization-ready. English is the source language; translate notices for the supported UI languages before release.

## Context and recipients

Default to deliberate selections and attachments. Show the distinction between attached, allowed to read and actually transmitted content. Explain wider project-reading permission explicitly; do not hide full-project upload behind a chat prompt. Include tool output and conversation summaries in transmission inspection. Use project-relative paths where possible because names, trees and absolute paths can themselves be confidential.

Exclude `.env` variants, keys, credentials, `.git`, dependencies and build artifacts by default. Enforce path/symlink boundaries and size limits outside the model. Secret scanning is an additional warning, not a guarantee. Untrusted file comments and tool responses cannot authorize retrieval or disclosure.

### Policy links

Use the applicable product/account policies, not just a brand name:

- [OpenRouter data collection](https://openrouter.ai/docs/guides/privacy/data-collection)
- [OpenRouter provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging)
- [OpenRouter ZDR](https://openrouter.ai/docs/guides/features/zdr)
- [OpenAI privacy policy](https://openai.com/policies/privacy-policy/)
- [Anthropic privacy policy](https://www.anthropic.com/legal/privacy)

The production notice must also link the routed provider's actual policy and any enabled remote tool/server policy. OpenAI and Anthropic consumer policies alone do not describe every API or business product. Authentication permission and subscription entitlement are separate from privacy policy.

## Retention, training and credentials

Treat no-training, no-content-retention, metadata retention and processing region as separate claims. OpenRouter's ZDR inference-routing controls do not automatically cover third-party plugins/tools. Do not infer EU hosting, GDPR compliance or complete confidentiality from a ZDR option.

Keep secrets in a verified native credential/encrypted store, not project files, browser localStorage, preview documents, conversation, export or logs. Redact error and usage records. Show only masked credential status to the renderer. Confirm native behavior on supported systems before calling storage secure.

Local conversation history is optional, project-isolated, stored privately outside the repository by default and deletable. Decide retention before release. Local deletion does not automatically delete provider data. Accepted editor changes are ordinary project content; review collaboration audiences separately. Personal chats and credentials are not automatically shared with collaborators.

## AI identification and human review

Label the feature and assistant output as AI. Keep "AI can make mistakes" visible in the panel, not buried in a policy link. Mark proposals as AI-generated and preserve their origin in the review/history UI. Never label an unrun check as passed.

Acceptance means editor state changed; Save means disk changed. Neither means tested or legally cleared. The initial workflow does not claim automated browser testing, a security audit or error-free output. Do not silently inject provenance comments into user source files without an explicit product decision.

## EU AI Act notes

Article 50 distinguishes informing people about direct AI interaction from machine-readable marking of certain synthetic outputs and specific deployer disclosure duties. Its requirements include clear, distinguishable and accessible information at the first interaction/exposure. The Commission's current guidance describes Article 50 as applicable from 2 August 2026.

Visible AI labeling and an error warning are required product safeguards, but they do not by themselves prove full compliance. In particular, assess whether Article 50(2)'s machine-readable marking/detectability requirements and exceptions, including standard editing assistance, apply to the actual output types and Somnia's role. Review public-interest text/deepfake disclosure rules if those use cases are later introduced. Do not claim that every code edit must carry the same public label or that a single UI badge satisfies every output duty.

The system's classification, provider/deployer roles, intended uses and applicable obligations need documented legal assessment. Data-protection opt-in is not itself an AI Act compliance certificate. This is implementation guidance, not legal advice.

Official sources checked for these notes:

- [Article 50, EU AI Act Service Desk](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50)
- [Commission transparency guidelines](https://digital-strategy.ec.europa.eu/en/policies/guidelines-ai-transparency-obligations)
- [Regulation (EU) 2024/1689](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng)

## Supplied implementation contract and gaps

The `agent/privacy` source supplied for this draft exposes `AgentPrivacyGate`, `agentPrivacy`, `assertProviderConsent`, `runWithProviderConsent` and `createAIProvenance`; UI exports include `AgentConsentNotice`, `AgentPrivacySettings`, `AgentErrorNotice` and `AIGeneratedLabel`. Consent is versioned in localStorage and records acceptance time. This is a non-secret preference store, not credential storage. The run wrapper tracks abort controllers and rechecks consent after completion.

Its current local exception is `provider: 'ollama'` plus an HTTP loopback URL without URL credentials. It does not inspect model locality or local-proxy forwarding. Its stored consent does not yet record provider-specific scope. Those are release/integration gaps, not demonstrated guarantees. Require model/route verification before exempting local Ollama and reconcile the recipient-scope design with the actual store. Provenance metadata/UI labels are not proof of machine-readable marking in exported output.

## Release gates

Reconcile the shared guard's exact API with Core/Provider/Panel; prove no cloud call without consent; test revoke/retry/fallback/race cases; verify local-only Ollama and remote/cloud exceptions; inspect outgoing payloads and secret redaction; check native storage/history deletion; translate accessible notices; verify provider/account-specific policies; finalize legal classification and output-marking assessment; reconcile the website draft. Only then promote this text from draft to a statement of demonstrated behavior.
