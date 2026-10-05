# Somnia internet transport spike

Isolated experiment for ADR-005, off PR #108. Not shipped in Somnia. No infrastructure was deployed and no paid account was opened.

## Run on Windows (PowerShell) or Linux

Requires Node 22+ and npm. From the repository root:

```powershell
cd phase1/prototypes/collab-internet
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

The browser test starts a loopback signaling room and opens two separate Chromium contexts. They establish a real WebRTC data channel, send binary frames both ways, and check disconnect cleanup. It prints `PASS`. This is a headless developer test, not an app feature or UI. No router rule, STUN service, TURN service, or account is required. `npm run demo` runs the same test.

## Contents

- `src/signaling.mjs`: one host and one guest; first-frame bearer authentication, distinct 256-bit tokens, 10-minute room TTL, authentication timeout, frame and connection limits, basic per-connection rate limit. Only offer, answer and ICE frames are forwarded. No persistence or application logging.
- `src/transport.mjs`: browser-compatible WebRTC adapter with injected APIs for tests. Host creates the offer; guest answers. Ordered data channel; serial SDP/ICE handling; bounded pre-SDP candidate queue; WSS except loopback; bounded binary frames and explicit send-side backpressure. Optional `relayOnly` maps to `iceTransportPolicy: 'relay'`.
- `test/`: 14 unit/integration tests plus real Chromium smoke test.
- `../../notes/ADR-005-internet-connectivity.md`: sourced recommendation, cost and privacy assessment, next acceptance gates.

The adapter accepts `iceServers` in standard `RTCConfiguration` format. Supply short-lived TURN credentials from an authenticated backend, never a TURN administrative API key. No vendor is enabled by default. An empty list only tests same-machine/LAN connectivity, not general internet reachability. With `relayOnly: true` and no usable TURN server it should time out, not silently fall back to revealing direct candidates.

## Integration boundary

Data frames are opaque bytes. Use the existing Yjs protocol above this layer, retaining host-side editor/viewer checks and host-only disk saving. This spike neither joins the old relay nor syncs Yjs documents. Signaling guest is a connection role, not an editor permission. There is deliberately no mesh: a future host opens one channel per guest and handles fan-out.

Frames are capped at 16 KiB; a large Yjs state needs a tested length-bounded chunk/reassembly layer, acknowledgement and resend policy before integration. This prototype rejects large frames rather than truncating them. Send-side backpressure throws so callers must retry after draining. Transport failure ends the session; reconnection, ICE restart, document resync, revocation and identity are not implemented. The signaling connection remains open and expires with the room even after data connects; production needs separate join TTL and active session lifetime.

## Security boundary

The server intentionally binds only `127.0.0.1`. Do not expose it via a tunnel or change the binding for production. WSS URL validation is not TLS deployment. Production needs an Origin allowlist, bounded handshake/rate budgets per principal and IP, account/session authorization, single-use or individually revocable guest admission, audited TURN credential issuance, and safe operational logging. Duplicate role rejection prevents replacement, not token theft. The basic rate limiter is not internet DoS protection. Room secrets must be transferred through a trusted invite channel and kept out of URL query strings, analytics, screenshots and logs. No secret appears in committed fixtures.

WebRTC encrypts data in transit, including over TURN. This is **not** independent identity verification: a malicious signaling service can substitute SDP/fingerprints and establish two connections. Before claiming that the signaling provider cannot read project data, authenticate the SDP fingerprint/handshake with an invite-derived secret or a verified peer identity. That protection is a design requirement, not implemented here. Direct ICE exposes network metadata to the peer; relay-only avoids direct candidates but leaves relay/signaling metadata. Do not call this anonymous or GDPR-certified.

## Manual internet acceptance matrix (not run)

After an approved hardened WSS deployment and short-lived TURN endpoint exist, test Windows WebView2 and Chromium, host on home broadband and guest on mobile data. Then test symmetric NAT, UDP denied with TURN/TLS 443 allowed, a corporate proxy that blocks non-HTTP TLS, and WSS-only fallback. Confirm selected candidate pair from `getStats`, forced relay mode, timeout/retry UI, expired/revoked credentials, offline edits/resync, role enforcement on host, 435 KiB document chunking, and shutdown with no leftover sidecar/ports. A successful local Chromium test does not certify Windows Tauri, TURN, VPN, tunnel, internet or restrictive firewall behavior.

## Measured locally

Node 22.23.3, Linux; all 14 tests pass; real Chromium bidirectional transfer and disconnect pass. `npm audit` reports zero known vulnerabilities for this isolated package at the time tested. Existing app and old collaboration package were not changed or audited by this slice.
