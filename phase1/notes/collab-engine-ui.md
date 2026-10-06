# Collaboration: real engine and share UI (v11/collab-engine-ui)

Builds on `v11/collab-protocol` (client, E2E key), `v11/collab-relay` (blind Rust relay) and `v11/collab-lan` (embedded desktop host).
No placeholder engine is left: the loopback stand-in was deleted. `store.ts` creates a `RealEngine` by default.

## Files
- `lib/collab/realEngine.ts` - `RealEngine implements CollabEngine`: one `CollabClient` per window. Host = client of its own LAN host (desktop) or of a self-hosted relay room; guest = client that adopts the shared project.
- `lib/collab/projectBridge.ts` - keeps the app project and the shared `Y.Map<path, Y.Text>` equal (text files only). Unit-tested without the app (`ProjectPort`).
- `lib/collab/appProject.ts` - the `ProjectPort` of the real app (store + editor core), `canJoinHere`.
- `lib/collab/awarenessSafe.ts` - remote awareness is untrusted: names clamped, colours must be `#rrggbb`, unknown fields dropped; the editor's cursor layer gets a sanitised view (`getSafeAwareness`).
- `lib/collab/invite.ts` / `inviteCore.ts` - link parsing, `relayRoomUrl`, `maskLink` (hides `#key=` and the room id), `modeOfLink`/`withMode`.
- `lib/collab/lanHostPort.ts` - registry for the desktop host; `main.tsx` registers `lanHost.ts` inside Tauri only.
- `components/ShareDialog.tsx`, `CollabStatus.tsx` - UI. All labels come from the snapshot.
- `src-tauri/tauri.conf.json`: `connect-src` gained `ws:` and `wss:` (both `csp` and `devCsp`), nothing broader. Reason: the user types the relay address or a guest pastes a host address, so the hosts are unknown at build time. `csp.test.ts` pins this (no `*`, no `http:`/`https:`). Caveat: ADR-003 wanted `connect-src 'none'` as the real boundary for extension code; with `ws:`/`wss:` that boundary is weaker. Extension workers still have `WebSocket` removed on a best-effort basis. Revisit before extensions are distributed.

## Behaviour
- Host (relay): user enters `wss://relay.example.com`; the app creates a 144-bit room id and a 256-bit key and hands out `wss://relay/room/<id>#key=<key>&m=relay`. Host connects with the same link. The relay address is remembered (not secret).
- Host (LAN-Direct, desktop only): `startLanHost` -> `createLanSessionLinks` (one key for all interfaces); the host connects to `localLink`. No private IPv4 found: the UI says so and offers the local-only link. In a browser the option is disabled with an explanation.
- Guest: paste the link, enter a name. The guest's project is replaced by the shared one once a peer answers. Joining is refused while the window has a disk project, a tab-folder project or unsaved changes (message: save or close first), so a guest save can never write host files into a guest folder.
- Host is the only disk writer: remote edits go through the editor core (`replaceSource`, origin `external`) and then the normal save path.
- Status labels: `Connected | Connecting... | Reconnecting... | Disconnected`, `LAN | Relay`, number of people, E2E fingerprint (8 hex chars) in the pill tooltip and in the dialog. "Mode" for a guest is read from `&m=` in the link; links without it fall back to the address (private/loopback = LAN). It is a label only.
- `synced` means: socket up, handshake done AND another person present. A blind relay cannot say more, so a lone host shows "Connected, but nobody else has answered yet".
- Participants and cursors come from Yjs awareness. A newcomer is answered with our own awareness state (a blind relay does not announce joins; without this the guest would see the host only after the 15 s heartbeat). Leaving sends an awareness removal first.

## Honest limits
- No view-only role. A blind relay and LAN-Direct cannot enforce it; the UI says everyone with the link can edit. (The loopback "roles" and invite lifetimes were fake and are gone.)
- No invite expiry or revocation: whoever has the link can join. Starting a new session creates a new room and key.
- Shared: text files (html, css, js, json, svg, txt, md) and newly created files. Not shared: rename, delete, images, PDFs. The UI says so.
- Late joiners need a live peer (relay stores nothing). The host must stay online.
- A web client cannot tell "refused", "room full" or "wrong address": all show as "unreachable" after the retries.
- Not tested: Windows, macOS, two real computers, the Rust LAN host inside the Tauri app, a public relay behind TLS.
- `LanHostSettings` (collab-lan) text is English only; the rest of the dialog is in 5 languages.
- Design view: remote edits arrive as file text, so element selection can move after a remote change (see collab-editor-integration.md).

## Tests
- `src/lib/collab/*.test.ts`: link parsing and masking, awareness sanitising, CSP pin, and `realEngine.test.ts` (host + guest engines over an in-memory blind relay: adoption, edits both ways, only encrypted frames on the wire, leave, unreachable, LAN adapter, error states).
- `tests/collab-relay.spec.ts`: two real browser windows against the real `somnia-relay` binary: share, join, live text both ways, remote cursor with name, labels, leave, relay restart with an offline edit. Needs the binary (`cargo build --release --manifest-path ../relay/Cargo.toml`, or `SOMNIA_RELAY_BIN`); skipped with that reason otherwise.
- `tests/collab-share.spec.ts`: dialog validation and error states without a relay.
