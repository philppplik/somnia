# Direct Ollama budget observer boundary

OllamaProvider.stream pins model/messages/tools/output limit before invoking context-budget observer, retaining original AbortSignal. Budget callback is informational, not authority to retarget approved context/model/tools. Callback mutation of caller request no longer changes outgoing chat or successful-model provenance. Abort after budget callback stops before chat with finish aborted, even if caller swaps its signal.

Context-budget calculation/check still uses pinned approved inputs and existing limits. Locality/weight/capability/privacy callers remain required; direct provider pinning grants none. Existing pre-abort finish behavior retained. Tests synthetic fetch only, no model quality or actual daemon/native proof. No cloud/fallback/dependencies/spending/UI expansion.
