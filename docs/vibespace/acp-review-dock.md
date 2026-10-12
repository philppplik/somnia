# ACP review dock

The Studio detail's review extensions have a Review / External agents (ACP) dock. ACP is a native-only client of the existing `vibespace_acp_*` bridge, not a second runtime.

## Workflow

1. Enter an agent name, executable path, and arguments as a JSON array of strings.
2. Launch registers a sandboxed agent with the existing consent broker. Approve the exact launch request in the panel. An unavailable sandbox fails closed in the native bridge; there is no elevated fallback.
3. When ready, start a new ACP session or resume the latest persisted session if available.
4. Send a prompt. While the blocking native prompt awaits permission, state notifications and polling still show consent requests. Consent decisions and cancellation remain usable during the turn.
5. Allow once, allow for this run (only if offered), or deny the exact request. Desktop actions cannot be allowed through this panel.
6. Close the agent to revoke the run and release an active slot.

The state store retains native session keys while switching Studio details or dock tabs. The current bridge has no session-enumeration command, so the UI lists only launches made in this running application. Persisted ACP sessions can be resumed after launching the same named agent again; the panel never invents unknown native handles.

## Fail-closed presentation and limits

- Native IPC or subscription unavailable: execution controls disabled, explicit notice, reconnect control for subscription failures.
- State read failure: existing content remains visible but unverified; consent and prompts are disabled until a successful refresh.
- Failed and closed status: no prompts or approvals.
- At most four live agents (failed/closed rows do not consume a slot). The bridge is the final authority on the process-wide cap.
- Prompts have at most 100,000 Unicode characters, counted by code point to match Rust. Over-limit input stays visible with Send disabled.
- Transcript displays the bridge's latest 500 events through `acpPresentation`; it explicitly marks a full event window. It is the reviewed lifecycle/permission transcript, not a rendering of arbitrary agent JSON or reasoning.
- Agent text is plain React text, never HTML. Display text strips control/bidi characters. Arguments are parsed as an array, never as a shell command.
- State refreshes on `somnia://vibespace-acp` and a two-second native-state poll while the panel is mounted. Subscriptions and timers are cleaned up on unmount. No network/site polling.

## Tests

```sh
cd phase1
npm run test:vibespace
npm run check:commands
npx playwright test --config scripts/vibespace-acp/playwright.config.ts
```

The Playwright fixture binds the real typed ACP client to deterministic IPC responses on localhost. It does not start a real external agent or prove platform sandbox support. Specs cover launch, session, prompt, consent during a pending turn, transcript, cancellation, read failures, bridge unavailable, limits, and Review docking. Screenshots are written only to `test-results/`.
