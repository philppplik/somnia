# Computer-use preparation API (A9)

This package does not enable desktop execution. The native ACP bridge has no
computer-use command or OS adapter. The frontend deliberately remains unavailable
and denies Allow, even on Linux. There is no synthetic availability fallback.

The policy crate's `computer-use-linux` feature exposes Linux-only preparation
when host code also supplies an explicit platform gate and the independent
`RuntimePermission::ComputerUse` permission. It does not install privileges or
start a capture/input service. Windows and macOS never pass this gate.

## Later host integration

1. Register a broker run with explicit `Desktop` kind. Bind a route to the
   external agent instance, ACP session and host-selected foreground surface.
2. `propose_session_start` always queues a human decision. Only AllowOnce exists.
   `start_session` consumes that exact approval and returns a separate host-only
   `ComputerUseSessionGrant`. Folder and MCP grants are never consulted.
3. Map typed mouse, keyboard and capture requests to `propose_action`. Each asks
   again with `Origin::Model`; agent/session/surface, action payload and session
   epoch are digest-bound. `prepare_action` consumes the single-use token.
4. A future reviewed Linux adapter must call the permit's `checkpoint` immediately
   before its exact effect, and perform its own foreground/geometry checks.
   Report input success or fixed failure. Do not treat a permit as execution.
5. Captures use `captured_artifact` with a host-generated private artifact ID,
   actual bytes digest and size. This produces only `PendingScreenArtifact` for
   private review. This preparation has no artifact release or ACP send method.
   Later disclosure must verify the displayed digest and ask the human again.
6. Revoke/drop the grant or cancel the run to abort. Restart increments the route
   epoch, invalidating earlier grants, permits and action tokens. Human decision
   APIs remain inaccessible to external agents.

The UI notice in consent and ReviewExtensions explains these boundaries in five
languages. The ACP presentation mapper accepts narrow `computer_use` decision
log entries (agent, phase, decision) and discards content. These entries must come
from a future host adapter after broker decisions, never from raw agent updates.
The localhost fixture demonstrates the intended consent/transcript presentation;
it is not production ACP wiring.

## Validation

- `cargo generate-lockfile` (no dependency/lock diff for this feature-only change)
- `cargo test --locked` in `phase1/vibespace-policy`
- `cargo test --locked --features computer-use-linux` in that crate
- `npx tsx src/lib/tauriPermissions.test.ts`; `npm run check:commands`
- `npm run test:vibespace`
- `npx playwright test --config scripts/vibespace-computer-use/playwright.config.ts`

No new Tauri command is added. A later OS adapter needs a separate reviewed package,
command/capability registration, cancellation integration, screenshot artifact
storage/release UI and platform evidence. See the first risk patch for exclusions.
