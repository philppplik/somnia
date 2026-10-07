# Security and provider-policy status

Reviewed baseline: 7 October 2026; see [source commit](README.md).
This is a code review boundary, not a security certification or legal opinion.

## What the baseline protects

Stored desktop API keys stay in the OS credential store. Native transport looks
up those keys and sends them only to the fixed allowlisted provider endpoints.
The UI receives presence, normalized errors and responses, not saved key material.
No plaintext-file fallback is implemented. Connection checks send no project
content and request no generation. Cloud consent gates renderer provider requests.

## What it does not guarantee

- A newly pasted key is still exposed to the trusted renderer during entry. Code
  execution there can steal a candidate or invoke allowed IPC. Window-label and
  capability controls do not make a compromised trusted renderer safe.
- A compromised OS, administrator, malware or an unlocked user session can defeat
  local credential protection. No claim of protection from those threats is made.
- The mutex is in-process, not a cross-process refresh/rotation lock. OAuth refresh
  safety and durable token-set recovery are not implemented in this baseline.
- Cloud consent is implemented in the frontend privacy gate; do not claim every
  direct native IPC call independently verifies consent. Audit this boundary before
  treating it as protection from hostile trusted-renderer code.
- Removing a local credential does not remotely revoke it, erase already-sent
  content, remove another application's copy or cancel subscriptions.
- Browser preview has a weaker, memory-only boundary. It is not native account OAuth.
- Code inspection and fixtures do not prove packaged-app behavior on Windows,
  macOS or Linux. Locked/unavailable stores and native networking need real tests.

## Billing and entitlement

Keep API keys and ChatGPT-account usage visibly separate. A subscription is not an
API key, and accepted metadata authentication is not verified inference access.
Do not advertise account usage as free or unlimited. Never silently consume API
billing after an account route fails. Any paid or credit-consuming live test needs
separate approval; none is part of this documentation work.

## Terms-of-service review

The [official SIWC contract](SIWC-CONTRACT.md) records primary OpenAI sources
checked 7 October 2026. They document an open-source/local account route, distinct
from Codex client impersonation. This does not certify Somnia's as-yet-uninspected
account implementation or imply no additional account risk. The discovery/issuer
mismatch is real; the SIWC contract records a selected fail-closed allowlist, not
a verified live-account result. Remote revocation remains unconfirmed. **TODO - wider provider-policy research result pending:**
verify current Anthropic restrictions and API-key policy sources before promoting
older design conclusions as fresh policy findings.

The review must distinguish:

- Provider-supported account inference from website identity-only sign-in.
- Somnia's own client/host identity from Codex's issued credentials or client ID.
- Open-source/local distribution from hosted, commercial or enterprise variants.
- Requested scopes from granted entitlement and allowed models/endpoints.
- API billing from plan allowance and any optional account credits.
- Account sign-out from confirmed remote revocation.

| Provider/mode | Current integration statement | Policy evidence to add |
| --- | --- | --- |
| OpenAI API key | Implemented in inspected baseline | Current API authentication/billing docs |
| OpenAI ChatGPT-account OAuth | Not implemented in inspected baseline | [SIWC sources](SIWC-CONTRACT.md); implementation, distribution and discovery checks pending |
| Anthropic Claude API key | Implemented in inspected baseline | Current API authentication docs |
| Claude subscription OAuth | Not implemented; do not offer or import tokens | Current published third-party restrictions |
| OpenRouter API key | Implemented in inspected baseline | Current API authentication/privacy docs |
| Ollama local connection | Local adapter; not subscription OAuth | Local model/endpoint verification |

Working third-party code, permissive code licensing and a successful HTTP response
are not evidence that a provider permits a login or account-usage route.

## Libraries

This documentation change adds no library or runtime dependency. The inspected
native credential code declares `keyring = 3.6.3`; its configured backend features
are Apple native, Windows native and synchronous Linux Secret Service. That is a
source fact, not a new dependency or a claim about this environment's OS store.

**TODO - OAuth dependency review:** list each library actually added by the auth
implementation, exact pinned/resolved version, verified MIT/Apache/BSD license,
upstream license source and redistributed notices. No copied OSS implementation
is included in this documentation change. Provider service terms are a separate
review from source-code licensing.
