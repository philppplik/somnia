# Direct LAN hosting (v11/collab-lan)

Based on phase1-foundation v10.1.0 plus collab-protocol (5a07545) and collab-relay
(9adb98e). This slice supplies an embedded Rust WebSocket relay, actual Tauri
commands, a TS adapter and a controlled settings component. It deliberately does
not replace the editor engine or modify the Share dialog: engine-ui owns that.

## Commands and lifecycle

- `collab_lan_start({lan,port})`: bind `127.0.0.1` when false, `0.0.0.0` when true.
  Port is a u16; 0 asks the OS for a free port. Duplicate starts fail, bind errors
  are returned, no background startup. The chosen port comes from the listener.
- `collab_lan_status()`: returns actual task state, not persisted UI state.
- `collab_lan_stop()`: signal shutdown, wait for the accept task, clear state.
  Drop also signals shutdown. Connections receive relay shutdown close 1001.
- Commands are registered in desktop.rs and build.rs and allowed only in the
  local main-window capability. Each command also checks the main window label.
- No mDNS, router configuration, firewall mutation or external hosting.

`LanHostInfo`: `{running,lan,port,localUrl,guestUrls,roomId}`. The room uses a fresh
pair of UUIDv4 values (244 random bits) for every start. Embedded Config.allowed_room rejects
all other room paths, including stale sessions, before upgrade. The standalone
relay keeps `allowed_room=None` and its multi-room behavior is unchanged.

`localUrl` always uses loopback for the host's own client. `guestUrls` enumerates
actual private IPv4 interface addresses for LAN mode, sorted and deduplicated.
Several interfaces may appear (including VPNs); let the user choose the route
that reaches their guest. No detected private IPv4 means an empty list, not a
made-up address. Loopback mode has only the local URL. IPv6/link-local/mDNS
are not supported in this slice. The URL is `ws://IP:port/room/<room-id>`.

## TS integration

```ts
const info = await startLanHost({lan: true, port: 0});
const links = await createLanSessionLinks(info);
// Connect the host's CollabClient to links.localLink with the project's Y.Doc.
// Share a selected links.guestLinks entry. Keep that host client online for sync.
// links.keyFingerprint is available for an out-of-band comparison.
// On stop, dispose the clients and call stopLanHost().
```

`createLanSessionLinks` generates one AES-GCM-256 key shared by every interface
and the host's own client. The key only goes into the URL fragment, never into
Rust, the query, logs or the handshake. Do not call `createLanInvite` once for
each address: its keys would differ. It is a single-address convenience only.
The adapter rejects in ordinary web browsers; it never reports pretend hosting.
Its command boundary is injectable for tests.

`LanHostSettings` is controlled: `{value:{lan,port},onChange,disabled?}`. Rendering
or changing it never starts a listener. It is English-only, matching the supplied
slice; translation and full-dialog integration belong to engine-ui. Its LAN note
explains Windows Firewall/private networks, route failures and no central service.

## Honest security limits

- Plain WS exposes IPs, timing, sizes and room IDs. It does not authenticate the
  host. The key-bearing link must be handed over through a trusted channel.
- The server only forwards opaque binary messages. No role enforcement, identity,
  per-guest revocation, invite TTL or disk writing exists here. Do not advertise
  viewer invites or expiry. Stop/restart rotates the room for everyone.
- LAN mode binds all IPv4 interfaces, including public/VPN interfaces. Private
  links are advertised, but binding does not restrict source IPs. Use a trusted
  network and private firewall rules; do not port-forward the listener.
- Relay traffic/frame/member/heartbeat limits remain active. A host client must
  stay connected because the relay stores no document and provides no replay.
- Existing client-layer integration follow-ups were reported separately:
  room-link reconnect must use parseWireInvite; keyed sessions must reject
  plaintext sync/awareness downgrade; Tauri CSP must allow intentional WS URLs.

## Verification (Linux workspace only)

- `npm run build`: pass (existing chunk-size/dynamic-import warnings).
- `npm run test:core`: 356 passed, 3 skipped spike interop tests (spike dependencies
  not installed in this workspace). Includes four new adapter/key tests.
- `cargo test --no-default-features` in src-tauri: 29 passed (9 unit, 20 integration).
  Three new tests use real loopback sockets: explicit start, two-client opaque
  fan-out, wrong room denial, occupied port, stop/restart old-link denial, LAN
  bind and drop cleanup. No mocks claim network acceptance.
- `cargo clippy --no-default-features --all-targets -- -D warnings`: pass.
- Relay `cargo test`: 18 pass; `cargo clippy --all-targets -- -D warnings`: pass.
- Settings preview inspected as actual Chromium screenshots for localhost and
  LAN modes. Labels, input focus, wrapping and firewall note were readable.
  This is a standalone component check, not integrated dialog verification.
- Native desktop feature was NOT compiled here: GTK/WebKit development libraries
  are absent. Tauri command/capability compilation must pass CI before release.
- Windows Firewall, native WebView WebSocket behavior, and two physical computers
  are NOT tested. Philipp must test those before calling the release stable.
