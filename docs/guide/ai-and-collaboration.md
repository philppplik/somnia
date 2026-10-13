# AI and collaboration

These are optional workflows. A local editor session does not require an AI provider or collaboration server.

## Somnia Agent

The Agent panel proposes bounded project changes. Review the exact context and changes before accepting; saving is a separate step. AI can be wrong. Approving a provider login is not the same as approving project disclosure, proving available credits or proving a successful model roundtrip.

Provider, API-key and account-login documentation has several historical baselines. Use the current build's supported provider flow and consult the [Agent index](https://github.com/philppplik/somnia/blob/main/docs/agent/README.md) and [authentication guides](https://github.com/philppplik/somnia/blob/main/docs/auth/README.md). A ChatGPT subscription is not an API billing plan. No universal subscription-login support or real-provider desktop acceptance is claimed here.

## Vibespace and MCP in the alpha line

The [alpha.3 release](https://github.com/philppplik/somnia/releases/tag/v12.2.0-alpha.3) adds local stdio ACP agents and consent-broker flows with Deny, Allow once and Allow for this session. Program and tool grants are scoped and revocable; definition changes invalidate tool grants. Process isolation is platform-specific and the release documents its restrictions.

**Computer use remains unavailable.** The alpha contains policy/consent preparation, not an OS mouse, screen or clipboard adapter. Do not advertise autonomous desktop control from those foundations.

[Alpha.7](https://github.com/philppplik/somnia/releases/tag/v12.2.0-alpha.7) adds studio-aware Agent context and schema-based parameter forms. That is not proof of every provider or studio action working on every desktop.

## Collaboration

The documented workflow is **Tools > Share project** for a host and **Tools > Join shared project** for a guest. Connect on a trusted LAN or through a relay you run. Only the host saves the shared project to disk; guests edit the shared copy.

Invite links can carry encryption keys. Share them only with trusted people. A keyed link enables end-to-end encryption; a link without a key is explicitly not end-to-end encrypted. Ending a session cannot erase copies, downloads or screenshots others already received.

People with a session key can edit and impersonate display names. Names, avatars and chat are not verified identities; a read-only viewer role is not an enforced security boundary. The guide documents text-file sharing limits and session-only chat/attachments.

Read the [collaboration guide](https://github.com/philppplik/somnia/blob/main/docs/collaboration.md) and [relay setup](https://github.com/philppplik/somnia/blob/main/relay/README.md) before sharing private work. LAN firewall and native desktop behavior still need testing on your platform.
