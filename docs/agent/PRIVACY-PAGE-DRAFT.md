# Privacy page addition: Somnia Agent

**Draft for https://somnia.philipp-paulik.de/privacy/. Not published. Verify against the integrated implementation before publication.**

## Somnia Agent and AI services

Somnia Agent uses artificial intelligence to answer prompts and propose changes. AI can make mistakes. Check generated content and review changes before applying or publishing them. AI responses and suggested changes are labelled in the app.

Cloud AI is optional. Before the first cloud request, Somnia asks you to explicitly allow sending your prompt, relevant conversation context and selected project content to the provider you choose. OpenRouter may route that content to its model providers. Processing may take place outside the EU. Retention, training, deletion and transfer practices vary by service, account type and settings. A ChatGPT or Claude subscription does not mean processing stays local.

Read your provider's privacy information:

- [OpenAI](https://openai.com/policies/eu-privacy-policy/)
- [Anthropic Privacy Center](https://privacy.claude.com/en/), including commercial API and consumer services
- [OpenRouter](https://openrouter.ai/privacy)
- [OpenRouter provider and data-collection guidance](https://openrouter.ai/docs/guides/privacy/data-collection)

Review the context before sending. Do not include passwords, API keys or personal data you do not have permission to share. Your cloud opt-in does not grant permission to disclose another person's data.

Withdraw cloud consent in Settings > AI privacy. Withdrawal blocks new cloud requests and cancels active requests in Somnia. It does not erase content already received by a provider or guarantee processing there stops. Contact the provider to exercise rights concerning its processing. You can keep using the editor without cloud AI.

For local processing, use Ollama on your device with a verified local model. Remote servers and cloud-backed models are not purely local and still require cloud consent. A local server may have its own logging settings.

Somnia stores the consent version and approval time in this app profile on your device. Permission is not shared across devices. A changed disclosure may require renewed approval.

### Editorial release checklist (not public text)

Verify actual provider destinations/routing and provider-scoped consent; local model classification; subprocess networking; context review and exclusions; chat-history location/retention; key storage; controller/contact/rights information; transfer safeguards and lawful basis; export marking under Article 50(2). Do not claim “no telemetry”, “never trained”, “EU-only”, “fully compliant” or “no developer server” without auditing the integrated product. This draft does not change the live website.
