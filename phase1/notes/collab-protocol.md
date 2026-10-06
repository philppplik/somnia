# Collaboration: transport + wire protocol (v11/collab-protocol)

Branch `v11/collab-protocol`, based on phase1-foundation (v10.1.0). Status: real, tested client-side
protocol layer. No UI in this slice. Nothing here is a placeholder: every code path is exercised by
tests, including three interop tests against the real spike relay over real WebSockets.

Philipp's constraint (2026-10-06, via main): no centrally hosted service. Two modes, same frames:

- **LAN-Direct**: the host's own app runs the relay (spike `relay.mjs` / `secure-relay.mjs` lineage).
  Guests connect to `ws(s)://host:port/?code=...`.
- **Self-hosted relay**: the user runs the relay themselves (binary/Docker, owned by the relay slice)
  and pastes or hands out its URL: `ws(s)://relay.example:9000/room/<room-id>` (Relay-Wire-Contract v0,
  agreed with the relay agent via main on 2026-10-06).

## Files

- `src/lib/collab/net/protocol.ts` - wire format, typed port of the spike's `protocol.mjs` + `identity-protocol.mjs`.
- `src/lib/collab/net/crypto.ts` - E2E link key (AES-GCM 256, WebCrypto).
- `src/lib/collab/net/transport.ts` - `Transport` interface + `WebSocketTransport` (browser webview and Node >= 22).
- `src/lib/collab/net/memoryTransport.ts` - in-memory transport for tests (real frames, real ordering).
- `src/lib/collab/net/client.ts` - `CollabClient`: handshake, auth, E2E, offline queue, reconnect.
- Tests: `protocol.test.ts`, `crypto.test.ts`, `client.test.ts`, `interop.test.ts` (29 tests total).

## Wire format

y-websocket convention, first varuint is the frame type. Binary-compatible with the spike relay
(proven by `interop.test.ts`):

| type | name | payload |
|---|---|---|
| 0 | MSG_SYNC | y-protocols sync sub-message: 0 = step1, 1 = step2, 2 = update |
| 1 | MSG_AWARENESS | varuint8array, y-protocols awareness update |
| 2 | MSG_IDENTITY | varstring JSON: `identity`, `presence` (relay->client); `set-role`, `revoke` (host->relay) |
| 3 | MSG_ENCRYPTED | varuint8array: 12-byte nonce + AES-GCM ciphertext of a MSG_SYNC or MSG_AWARENESS frame |

Handshake: on open the client flushes its outbox, sends sync step1, then its awareness state. The relay
(or any live peer through a blind relay) answers step2. `handleMessage` answers step1 with step2
automatically, which is what lets a blind relay stay dumb: peers sync each other through it.

Auth: the invite code travels in the WebSocket URL query (ADR-005 threat model: browsers cannot set
headers on WebSockets; with the secure relay the code is sent only after the TLS fingerprint check).
Relay-Wire-Contract v0 room links carry the access entropy in the room id and need no code parameter;
both shapes are accepted (`parseWireInvite` in client.ts).

## E2E link key

The invite link carries a 256-bit AES-GCM key in its URL **fragment**: `...#key=<base64url>`.
Fragments are never sent in an HTTP/WebSocket request, so a relay on the path - including a
self-hosted one - cannot read the content. With a key present, every sync/awareness frame goes out
as MSG_ENCRYPTED. Identity frames stay plain (they carry roles/names, no document content).
`LinkKey.fingerprint` (8 hex chars of SHA-256 over the key) lets two people compare out of band that
they are in the same session.

Honest limits:
- A blind relay cannot enforce "viewers cannot write" or hold the document for late joiners.
  Late joiner needs a live peer (relay contract: no relay state/replay). Host stays the only disk writer.
- The host always sees the content: it owns the key and writes the project to disk.
- Invited guests hold the key while invited. Revocation stops re-entry (relay side); it cannot take back what they saw.
- **Follow-up for the share-UI slice**: `maskLink()` masks only `?code=`. A `#key=` fragment must be masked too.

## Reconnect and offline queue

- Any unexpected close retries with exponential backoff (base 500 ms, x2, cap 15 s, ±25% jitter),
  up to `maxAttempts` (default 6). Applies to the initial connect and to mid-session drops alike.
- Final closes (no retry): 4001/4003 invite revoked, 1008 send budget / rate limit, 1003 protocol error,
  1009 frame over the relay's 2 MiB limit (resyncing would resend the same frame).
- Reconnectable closes: 1006 network drop, 1001 relay shutdown, 1013 too slow (contract says:
  reconnect + full resync - the step1 handshake on the next open does exactly that).
- A web client never sees the HTTP status of a refused upgrade (404/429/503 from the relay contract,
  401 from the spike relay). These surface as `unreachable` after the retries. The UI must not claim
  a more specific reason. (Node's undici WebSocket never fires `close` for a refused upgrade at all;
  `WebSocketTransport` synthesizes exactly one close so the retry logic cannot hang.)
- Offline queue: document updates made while disconnected are buffered (outbox, default 1000 entries)
  and flushed on the next open, before sync step1. The Y.Doc is the real store - an outbox overflow
  is reported (`droppedFromQueue`) and repaired by the sync handshake; nothing is silently lost.
  Yjs updates from one client are clock-chained, so out-of-order delivery would stall: ordered flush +
  the handshake keep this correct (covered by tests).
- Awareness (cursors) is ephemeral and intentionally not queued; the local state is re-sent on open.

## State surface for the UI

`snapshot()`: `state` (`idle|connecting|connected|reconnecting|error`, same names as the loopback
engine's `GuestState`), `mode`, `synced`, `attempt`, `identity`, `people`, `error`
(`bad-link|refused|blocked|unreachable` - `expired`/`full` are NOT detectable on a web client),
`queued`, `droppedFromQueue`, `security{e2e,keyFingerprint,secureChannel,insecureRemote}`.
Labels must come from these fields, not assumptions.

## Tests (all in `npm run test:core`, 355 tests total on this branch)

- protocol: sync/update/awareness/identity round trips, malformed frames, clock-chain repair.
- crypto: key import/export, fingerprints, round trip, tamper + wrong key fail, fragment parsing.
- client (memory transport + a scripted relay): connect, convergence both ways, offline queue flush,
  outbox overflow repaired by handshake, unreachable retries then error, revoked/blocked/too-big final,
  bad link, host-command guard, leave, E2E through a blind relay (relay sees only ciphertext),
  wire capture unreadable without the key, room-link invites.
- interop (real spike relay, real WebSockets on 127.0.0.1): guest joins and gets its credential
  identity, edits converge both ways, socket drop -> reconnect -> offline edit lands, viewer writes
  are dropped by the relay, wrong code errors instead of hanging. The spike and the app run different
  yjs minor versions in these tests; they interoperate across the wire. (Skipped only if the spike's
  own `npm install` was not run.)

## Not done here / handover notes

- No UI, no engine wiring: `setCollabEngine()` with a real engine built on `CollabClient` is the
  follow-up (share-UI / engine slice). Nothing user-facing exists in this slice, so there was nothing
  to screenshot; `npm run build` passes.
- Never tested on Windows or against a second physical machine. Loopback only.
- The host-side peer (running the relay inside the Tauri app for LAN-Direct) is a separate slice;
  `protocol.ts` + `crypto.ts` + `memoryTransport.ts` are written to be reused by it.
- TLS pinning (secure relay, `fp=` invite parameter) needs a Node/Tauri socket; a browser webview
  cannot pin. `Transport` is the seam where a pinning transport plugs in.
- No heartbeat/ping yet: a silently dead TCP connection is noticed on the next send or close.
- Single transactions over 2 MiB (relay contract cap) are not chunked; pasting a huge file in one
  edit gets the connection closed (1009) with an honest error.
