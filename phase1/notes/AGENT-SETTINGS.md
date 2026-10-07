# Agent settings persistence

Provider, model and up to 20 custom prompts live in agent-settings.json under Tauri's app config directory, outside projects. Enabled prompt text is sent as an additional system message on every provider round. The base safety prompt stays first; custom prompts do not grant tool/file access or cloud consent. Total custom text is limited to 16000 UTF-8 bytes, each prompt to 8000 bytes. Empty/disabled prompts are not sent.

The OpenRouter API key lives in the OS credential store: macOS Keychain, Windows Credential Manager, or Linux Secret Service. IPC is main-editor-only. Secret-store errors are generic; keys are never written to app log, project exports, localStorage or config JSON. Locked/unavailable credential stores fail visibly, with no plaintext fallback. Empty key + Use configuration deletes the stored key. Provider selection can change without losing the key.

Browser preview persists only non-secret settings in localStorage. Its API key is session-only. Active-file permission resets on panel restore; cloud consent is controlled by the existing privacy gate.

Automated coverage: preference round-trip/permissions/invalid input Rust tests; non-secret projection and custom prompt injection per provider round in Node tests; Playwright reload/edit/delete/enable checks. Actual OS keychain unlock prompts and persistence across a real desktop app restart still need maintainer acceptance on macOS/Windows/Linux.
