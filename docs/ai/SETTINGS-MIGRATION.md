# AI settings relocation

Settings > Power-Ups > AI is the only persistent configuration surface. Tabs are
Providers & models, Instructions, and Privacy & data. The panel gear opens provider
settings; the consent link opens privacy. Old `AI Privacy` / `AI privacy` routes
remain aliases. No persistence schema or provider broker changed.

`settingsRuntime.ts` loads once even with the panel closed. The Settings form is a
draft until Save AI settings. Saving starts a new core session but preserves visible
chat. Configuration and credential operations are disabled while generating or
while a proposal awaits review. Resolve proposals or start New chat first. Consent
withdrawal remains available and uses the existing global aborting gate.

Active-file access remains a session-only checkbox in the panel. Provider keys use
the existing explicit test/save/rotate/delete component and OS credential broker;
no key is written to preferences. Cloud testing and model discovery are explicit
metadata requests, never inference. Saving preferences does not grant consent.

Instructions show UTF-8 byte counts and reject over 8,000 bytes per prompt or 16,000
total, with at most 20 prompts. Search reveals the matched tab and keeps its related
controls visible instead of hiding the form's context. Tabs support arrows/Home/End.
New navigation and tab labels are in all five locales; pre-existing English provider
and prompt form labels are unchanged.

The decorative gradient/code preview under Appearance was removed. Glass opacity,
blur, scopes, reset, platform and contrast warnings remain functional. The agent's
own gradient is unchanged. Narrow-window Settings was raised above the communication
overlay, which otherwise covered the newly relocated controls.

## Verification

- `npm run build` (TypeScript and production Vite)
- `npm run test:core` (tsx/node:test)
- `npx tsx --test src/components/AgentSettings.test.tsx src/lib/agent/settingsRuntime.test.ts src/lib/agent/settings.test.ts src/lib/agentPrivacy.test.ts`
- `node --test scripts/test-agent-settings-ui.mjs` from phase1; Chrome path defaults
  to `/usr/bin/google-chrome`. Uses only intercepted fixture provider responses.
  Tests relocated settings, real harness prompt propagation, chat preservation on
  save, credential fixture save, consent denial, search, byte limits, keyboard tabs,
  reopening, light/dark/high contrast, and screenshots.

## Integration notes

Old Playwright specs targeting configuration controls inside the Agent panel or the
old standalone consent modal need migration. This patch supplies a node:test UI
regression rather than rewriting unrelated suites. Native Windows/macOS keychain
and desktop layout still need owner-device validation; web fixture tests do not
prove OS keychain behavior.

The deeper concept's Add/Replace-key disclosure and expandable one-at-a-time prompt
editors were not introduced: existing controls were moved intact to preserve their
behavior. Current search reveals the relevant tab and all its controls; it does not
steal keyboard focus from the search box.

No dependencies, external source code, paid calls, release, push or CI runs added.
