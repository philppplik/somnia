# Account authentication UI

Account controls live beside the API key in Settings > Power-Ups > AI >
Providers & models. OpenAI is the only account-login provider in this wave.
Claude/OpenRouter remain API-key-only; Ollama remains local. Browser preview
shows an honest desktop requirement rather than attempting OAuth from JavaScript.

The account lifecycle is disconnected, pending, connected, expired. Start delegates
browser launch and the full OAuth transaction to the native broker. Cancellation
and disconnect are explicit. Disconnect removes OAuth credentials, not API keys;
provider-side revocation is not promised. The UI points to ChatGPT settings for
revoking access there. API-key fallback is an explicit method selection, never an
automatic change after an account failure. Account selection is unavailable until
a connection is valid; expiration preserves the chosen method so the backend can
fail closed. Cloud inference consent remains a separate existing gate.

## Native contract

All commands accept `{provider: "openai"}` and return a public status object:

```ts
interface AccountStatus {
  provider: 'openai';
  state: 'disconnected' | 'pending' | 'connected' | 'expired';
  method: 'account' | 'api-key';
  expiresAt?: number; // Unix milliseconds, not seconds
}
```

- `agent_account_status`: read public metadata, no login/network action.
- `agent_account_start`: begin login and open the trusted system browser natively.
- `agent_account_cancel`: cancel any pending login.
- `agent_account_disconnect`: cancel pending work and delete local OAuth secrets;
  retain the provider API key.
- `agent_account_set_method`: additionally accepts `method: 'account' | 'api-key'`.
  Reject account mode without a valid connection. Preference applies immediately.

No access/refresh/ID token, account email or authorization URL is returned to React.
The decoder projects only allowed fields; malformed status fails closed. Native
errors are mapped to localized generic copy, never rendered or logged verbatim.
The transport is injectable for node tests, but production always uses native invoke.

## Updates and concurrency

While mounted, the hook reads status on mount, focus and the payload-free
`somnia:agent-account-changed` event. Pending status is re-read after 2 seconds;
connected metadata after 30 seconds. These are local broker reads, not repeated
HTTP calls. Timers are canceled on unmount/provider change. Generation and request
serial checks discard old results. A status-read failure clears the stale badge
and exposes Retry instead of continuing to claim Connected. Expiry timestamps
are checked locally. Command actions lock other credential edits while executing;
Settings' existing running/proposal locks still apply. The Agent summary links
back to the Providers & models tab.

## Verification

From `phase1/`:

```sh
npm run build
npx tsx --test src/lib/agent/accountAuth.test.ts src/components/ProviderAccountConnection.test.tsx
node --test scripts/test-account-auth-ui.mjs
```

The node:test browser fixture uses local Chrome and intercepted/native-mock state;
it never logs in, sends paid requests, or contacts OpenAI. It checks pending/cancel,
connected, expiry, explicit fallback, unlink, safe failure, browser restrictions,
Agent status, Settings link, and all five locales. It saves screenshots under
`/downloads/auth-ui` (override Chrome via `CHROME_PATH`). Unit tests cover DTO
projection, malformed native responses, command arguments, unsupported providers,
expiration and localized strings. Screenshots were visually inspected for light,
dark/narrow, expired and Agent panel states.

Real desktop broker integration, OS credential-store behavior, actual OAuth and
account inference remain separate owner/device tests. This UI patch does not
implement or certify those backend behaviors. Apply on the settings-ki prerequisite;
do not re-apply the local prerequisite commit if Settings AI is already integrated.

No dependencies or external source code were added. Existing React/react-dom,
Tauri JS API, tsx and Playwright use MIT; Node uses its existing MIT-licensed runtime.
No push, PR, CI, release or paid API call was made.
