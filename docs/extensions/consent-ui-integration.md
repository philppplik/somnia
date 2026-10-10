# Trusted extension consent UI

The app shell mounts `ExtensionConsentHost`; Extensions settings mounts
`ExtensionSecuritySettings`. Settings entry never acknowledges first run.
Only the explicit Enable extensions action calls `acknowledgeFirstRun`.
Consent mutations emit `somnia:extension-consent-changed` and the legacy
`somnia:extensions-changed` / `somnia:extensions-reload` events.

## Supervisor wiring

Before opening v2 permission sessions, call `configureConsentBroker` with the
supervisor-owned `PermissionBroker`. Its invalidate hook must cancel guest
requests, terminate the affected process/session and unload extension panels.
The fallback broker provides startup/settings persistence and legacy reload,
not a substitute for supervisor shutdown or package installation.

The trusted staging/store controller calls `requestConsentReview` with:

- `candidate`: validated manifest, exact artifact and manifest SHA-256 values,
  source, validation result, previous manifest for updates, optional verified
  publisher record and source path.
- `revalidate`: immediately re-read staged bytes, integrity, compatibility and
  the candidate identity. Changed candidates are refused, not silently approved.
- `commit`: host transaction that binds the staged bytes, invokes the supplied
  broker approval function and atomically swaps the package. It must roll back
  both package state and approval on failure. The current package stays running
  until the transaction. Do not use an approval call alone as an installer.
- optional `onActivity`: open extension-scoped activity without destroying the
  review state; the caller owns navigation and returning to the review.

Do not register bridge functions, approval, native hold, developer/restricted
mode or blocklist methods with any extension RPC surface. There is no guest
`postMessage` listener in this UI.

Native approval is manual only and needs the broker's uninterrupted 3000ms
hold. Pointer release, pointer cancellation, capture loss, key release, blur,
hidden document and unmount cancel it. Revalidation is part of that hold's
commit: releasing before broker approval fails closed. Native declarations are
not represented as confinement, and native packages receive no verified mark.

Runtime requests come only from `pendingPrompts(foreground)`. One is shown at
a time; coalescing and lifetimes stay in the broker. Extension panels expose
`data-extension-id` for adjacent positioning. Headless requests show identity
in the Extensions shell surface. Clipboard Always is deliberately omitted
until the documented policy conflict is decided; folder requests have
Once/Session/Always. Persistent folder and clipboard grants can be revoked in
settings. Close/Escape denies a runtime call; closing an update does not decline
it. Decline records the exact candidate version and retains old approval.

The default broker notification hook forwards blocklist messages to the shell.
A configured supervisor must forward its notification to
`somnia:extension-consent-blocked` (detail: `extensionId`, `message`). Blocking
belongs to the verified index controller, never to this UI or an extension.
The dialog reports disabled state and data retention; it cannot uninstall or
bypass a block. The broker currently blocks by extension ID, not candidate
version: a blocked-old/candidate-unblocked recovery transaction therefore needs
an upstream version-aware controller decision before the UI can approve it.

## Tests and known boundaries

Run `npx tsx --test src/lib/extensions/consentDisplay.test.ts
src/lib/extensions/permissionBroker.test.ts` from `phase1` for unit checks.
Run `npx playwright test --config playwright.consent.config.ts` for real browser
component tests. The isolated harness avoids unrelated generated WASM builds.
Its mock package/commit callback is only test data, never shipped installer code.

Pixels checked: install, update, runtime folder, restricted first-run, native
hold warning, blocklist notice, dark theme and small-window 200% text scaling.
The body scrolls while header/footer stay visible; targets remain selectable
and copyable. All five catalogues have identical consent keys and placeholders.

This branch does not replace the legacy JSON extension catalog with v2 staging.
Store detail routing, atomic package swap, candidate-specific blocklist handling,
Activity navigation and native process shutdown are owned by their host/store
branches and must be connected before claiming an end-to-end v2 install.
