# Collaboration spike (ADR-005)

Standalone prototype. Not imported by the app, not part of the build, no app changes.

What it proves: Yjs plus a small WebSocket relay can keep one project (a map of file name to `Y.Text`) in sync between a host and guests, with roles, invite codes, remote cursors, offline merge and host-only saving.

## Layout
- `src/relay.mjs` relay run by the host. Roles by invite code (host, editor, viewer), expiry, client cap, auth-failure block, 5 MB message cap, viewer writes dropped.
- `src/session.mjs` client. `files` is a `Y.Map<path, Y.Text>`; awareness carries cursors.
- `src/protocol.mjs` y-websocket style framing (sync + awareness).
- `src/paths.mjs` project-relative path checks for every remote file name.
- `src/host-save.mjs` host-only: load folder, atomic save, and a watcher that flags broken HTML after remote updates.
- `src/html-check.mjs` tag balance check. Reports only, never rewrites.
- `bench.mjs` rough size and merge numbers. `demo.mjs` one-machine demo.

## Run
Node 22+.
```
cd phase1/prototypes/collab-spike
npm install
npm test
npm run demo
node bench.mjs
```
The relay binds to 127.0.0.1 by default, so no firewall prompt. Binding 0.0.0.0 for a LAN session is an explicit option (`new Relay({ host: '0.0.0.0' })`).

See `../../notes/ADR-005-spike-findings.md` for results and the recommendation.

## Transport security (SecureRelay)
`src/secure-relay.mjs` wraps the relay with TLS 1.3 (self-signed, fingerprint pinned in the invite), revocable and rotatable invites, rate limits, Origin allow-list. Threat model: `../../notes/ADR-005-threat-model.md`.

```js
import { SecureRelay } from './src/secure-relay.mjs'
import { Session } from './src/session.mjs'
import { pinnedPrepare } from './src/pinning.mjs'

const relay = new SecureRelay({ host: '0.0.0.0' })   // wss, session certificate generated
await relay.ready
const inv = relay.createInvite('editor', { hostname: '192.168.1.20', ttlMs: 10 * 60_000, maxUses: 1 })
// give inv.url to the guest, keep inv.id
const guest = new Session(inv.url, { prepare: pinnedPrepare(inv.url) })
await guest.connect()
relay.revoke(inv.id)          // guest is disconnected
relay.revokeAllGuests()       // panic button
```
Tests: `test/transport.test.mjs` (included in `npm test`). Plain ws:// on non-loopback is refused unless `allowInsecureLan: true`.
