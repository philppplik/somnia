# Provider account authentication

Status: documentation baseline for the account-auth work, 7 October 2026.
Inspected source: `somnia-agent` commit `bb9d1fab7682f402a6a88280e69dd0ab71640b81`.

This directory separates what the inspected app does from proposed ChatGPT-account
OAuth. It is not a release announcement. **Account OAuth is not implemented in
this inspected baseline.** Do not advertise it as available until the implementation,
policy review and packaged-app checks are recorded here.

- [User guide](USER-GUIDE.md): connect, replace and delete API keys; stored data;
  account-login status and troubleshooting.
- [Developer guide](DEVELOPER-GUIDE.md): current IPC and endpoints, trust boundary,
  lifecycle and requirements for adding OAuth providers.
- [Security and policy](SECURITY-AND-POLICY.md): known limits, billing and terms gates.
- [Integration checklist](INTEGRATION.md): pending evidence and verification record.

API-key access and a ChatGPT subscription are different authentication and billing
paths. Successful authentication does not prove model access, available credits,
permission to send project content or successful inference.

The earlier [authentication decision](../agent/AUTH-DECISION.md) is a design document
for an older baseline. Its statements about keys returning to React are not a
current-code description of the native transport inspected here. Neither document
establishes permission from a provider to use its account-login flow.
