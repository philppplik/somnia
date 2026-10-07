/** English source catalogue. Merge into the app's flat catalogues on integration. */
export const AGENT_PRIVACY_EN = {
  'agent.privacy.title': 'AI and your data',
  'agent.privacy.disclosure': 'Somnia Agent uses AI. Cloud models send your prompt, chat context and selected project content to your provider. OpenRouter may forward it to model providers. Processing may occur outside the EU. Retention and training depend on the provider and your settings.',
  'agent.privacy.consent': 'I agree to send this data to the cloud providers I choose, including their model providers.',
  'agent.privacy.enable': 'Allow cloud AI',
  'agent.privacy.required': 'Allow cloud AI before sending data to a provider.',
  'agent.privacy.saveFailed': 'Consent could not be saved. No cloud request was enabled.',
  'agent.privacy.revoke': 'Withdraw cloud consent',
  'agent.privacy.enabled': 'Cloud consent is on.',
  'agent.privacy.disabled': 'Cloud consent is off.',
  'agent.privacy.withdrawal': 'Withdrawal stops new cloud requests and cancels active ones. It cannot erase data already sent. Contact the provider about deletion.',
  'agent.privacy.local': 'For local processing, use Ollama on this device. Remote Ollama servers still need cloud consent.',
  'agent.privacy.policies': 'Provider privacy policies',
  'agent.privacy.review': 'Review the context before sending. Do not include secrets or personal data you are not allowed to share.',
  'agent.ai.label': 'AI-generated',
  'agent.ai.reviewed': 'AI-generated, human-reviewed',
  'agent.ai.warning': 'AI can make mistakes. Review changes before applying them.',
} as const;
export type AgentPrivacyKey = keyof typeof AGENT_PRIVACY_EN;
export type AgentPrivacyTranslate = (key: AgentPrivacyKey) => string;
export const agentPrivacyEnglish: AgentPrivacyTranslate = key => AGENT_PRIVACY_EN[key];
