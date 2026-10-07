# Connect a provider

This guide describes the inspected API-key implementation, not a released
ChatGPT-account login. See the [implementation status](README.md).

## Connect with an API key

1. Open Somnia Agent and choose **Agent configuration**.
2. Select **OpenAI API (cloud)**, **Anthropic Claude API (desktop)** or
   **OpenRouter (cloud)**. Choose a model or enter its ID.
3. Open **Cloud data consent** and read the disclosure before allowing cloud AI.
   Cloud connection tests and model-list requests need this permission too.
4. Enter a key issued by the selected provider into **API key**.
5. Choose **Test and save key**. Somnia makes a metadata request, not a generation
   request. It sends no prompt or project files in this check.
6. Choose **Use configuration** to save the provider, model and custom prompts.
   Saving configuration is separate from saving a verified key.

A successful check means the provider accepted the credential for this metadata
request at that time. It does not guarantee that a selected model supports tools,
that generation will succeed or that usage is free. API usage is separate from
consumer subscriptions. Somnia does not verify an account's allowance in this check.

## Replace or disconnect a key

To replace a saved key, enter its replacement and choose **Test and rotate key**.
Editing alone does not replace the saved key. A failed check leaves it unchanged.
A failed credential-store write is an error, not a successful replacement.

**Test saved key** checks the existing key without displaying it. **Delete key**
removes Somnia's saved credential for that provider. It does not revoke the key at
the provider, remove copies in other apps or cancel provider subscriptions. Revoke
a compromised key using the provider's account controls too.

Switching providers does not delete another provider's key. The baseline supports
one saved API key per cloud provider, not a list of independently named accounts.

To stop sending cloud context, withdraw permission under **AI privacy**. That
stops tracked cloud requests and blocks later ones; it cannot recall data already
received by a provider. Deleting a key and withdrawing consent are separate actions.

## What is stored

| Data | Desktop | Browser preview |
| --- | --- | --- |
| API keys | OS credential store; no plaintext-file fallback | Process memory for this session only |
| Provider and selected model | App configuration, `agent-settings.json` | Local browser preferences |
| Custom prompt names and text | Same non-secret preferences file | Same local browser preferences |
| Cloud consent | Local webview storage, version and consent timestamp | Local browser storage |
| Permission to read the active file | Resets to false when preferences load | Resets to false when preferences load |
| OAuth access/refresh tokens | Not implemented in this baseline | Not implemented |

Custom prompts are not secret storage. Enabled prompts accompany AI requests, so
never put passwords, tokens or private keys in them. Metadata and prompt text can
still be sensitive even though they are not credentials.

Newly pasted API keys briefly exist in the UI's memory. After a successful save,
the field is cleared. In the desktop app, later authenticated cloud requests use
the native broker; the stored key is not returned to the UI. Browser preview does
not have the same native boundary, and browser CORS restrictions may prevent use.

## Errors and recovery

- Credential store locked or unavailable: unlock it and retry. Somnia does not
  quietly save the key into a plaintext settings file.
- Key rejected: check the selected provider, expiry and provider permissions. The
  baseline groups 401 and 403 responses as key rejection; a restricted key can be
  valid for inference while lacking model-discovery permission.
- Rate limit: wait before trying again. Do not assume this means credits remain.
- Network failure or timeout: check connectivity and retry the metadata check.
  Browser-preview CORS restrictions can be a cause.
- **Cancel test** stops the pending check. It does not revoke a stored credential.
- Models fail to load: check cloud consent, the key and provider access. A model ID
  may be entered manually, but that does not prove the model is available.

## ChatGPT-account login

**Not available in the inspected baseline.** A ChatGPT login must be a separate
connection from **OpenAI API (cloud)**, not a substitute key pasted into that field.
Never copy tokens from Codex, ChatGPT browser cookies or another application's
credential file into Somnia.

**TODO - account-auth implementation:** document the actual sign-in and disconnect
controls, browser/callback behavior, cancellation, supported distribution, account
identity, stored token metadata, expiry, refresh failures and remote revocation.
Do not infer these behaviors from an intended flow. The developer implementation
and dated provider-policy evidence must be reviewed first.
