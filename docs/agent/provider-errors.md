# Provider failures and retries

Somnia's OpenRouter and Ollama chat transports share a bounded retry policy:

- Retry HTTP 408, rate-limit 429, 5xx and initial network failures, before streaming starts.
- Default: three retries (four attempts), exponential backoff, 0-25% jitter. The retry count is capped at five.
- Honor Retry-After seconds and HTTP dates as minimum delays. Cooldowns over 60 seconds stop automatic retries and are shown to the user, rather than retrying early.
- Invalid keys, exhausted credit/quota, missing models and unsupported requests are not automatically retried.
- Cancellation and cloud consent withdrawal interrupt a pending retry. The existing privacy gate stays active for the full provider stream, including its initial retries.
- Never replay a stream once it has started. Text and tool fragments could otherwise be duplicated, and a provider may already have billed the request.

Failures show fixed, actionable text rather than raw provider bodies, which may contain secrets or prompts. Error bodies are read only up to 4 KB and released. Known quota codes and quota/spending-limit phrases distinguish an exhausted quota from a transient rate limit. Unknown 429s remain rate limits.

The panel keeps the original prompt and delivered partial text when a turn fails, ends the streaming indicator, and explicitly warns that the partial answer is incomplete. Manual Retry starts the request again; it does not continue an interrupted stream. The failed turn does not enter successful model conversation history or apply staged changes. The existing chat is held in memory; this change does not add disk persistence across app restarts.

## Verification

Unit tests cover status mapping, secret-safe messages, bounded retries, backoff, Retry-After, cancellation, quota exhaustion and non-replay of partial text/tool streams. Browser tests in `phase1/tests/provider-errors.spec.ts` exercise actual panel failures and manual retry with mocked local provider responses. No paid model calls are required.
