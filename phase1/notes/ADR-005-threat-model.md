# ADR-005 threat model: collaboration relay transport

Status: draft, prototype level. Scope: the host-run relay in `prototypes/collab-spike` plus `SecureRelay` (transport-security slice). Identity and per-guest roles are handled by a sibling slice and are out of scope here.

## What we protect
1. Project content (HTML, CSS, JS, assets) in transit between host and guests.
2. The host machine: the relay runs on it and the host writes guest edits to disk.
3. Session access: only people the host invited can join, and the host can throw them out.
4. Availability of the host's editor during a session.

## Actors
- Invited guest (trusted to a role, not to more).
- Former guest whose invite was revoked.
- Network attacker on the same LAN or Wi-Fi (passive sniffing, active man in the middle).
- Remote attacker who can reach the port (port forwarding, public IP).
- Malicious web page open in the host's or a guest's browser.

## Design
| Control | What it does | Where |
|---|---|---|
| TLS 1.3 (wss) | Encrypts and authenticates the channel. Plain ws:// only on loopback; the relay refuses ws:// on any other address. | `secure-relay.mjs` |
| Per-session self-signed certificate | No CA needed on a LAN. Valid 2 days, new key every session. Built with node:crypto, no openssl, so it works on Windows. | `cert.mjs` |
| Fingerprint pinning | The invite carries the SHA-256 of the certificate (`fp=`). The guest checks it after the handshake and before sending the HTTP upgrade, so a man in the middle never sees the invite code. | `pinning.mjs` |
| Invites | 128-bit random codes, many per session, each with role, expiry, optional use limit. Only hashes are stored. | `invites.mjs` |
| Revoke / rotate | Revoking an invite closes its live connections (close code 4001) and refuses new joins. Rotate = revoke + fresh code. `revokeAllGuests()` is the panic button. | `secure-relay.mjs` |
| Rate limits | Per address: 30 handshakes/min, max 4 open connections, 5 bad codes lock the address for 5 min, doubling on each repeat (max 1 h). Per connection: 100 msgs/s (burst 300), 1 MB/s (burst 5 MB). Exceeding closes the socket (1008). Hard caps stay: 5 MB per message, 8 clients. | `limits.mjs` |
| Origin allow-list | If configured, browser requests with a foreign `Origin` get 403. Stops a malicious web page from talking to a local relay. Node/Tauri clients without Origin pass; they still need a code. | `secure-relay.mjs` |
| Heartbeat | Dead sockets are dropped after one missed ping; slow-header connections time out after 10 s. | `secure-relay.mjs` |
| Unknown HTTP paths | 404 with no banner. | `secure-relay.mjs` |

## Threats and status
| Threat | Mitigation | Residual risk |
|---|---|---|
| Sniffing content on shared Wi-Fi | TLS 1.3 | None for content. Traffic size and timing are visible. |
| Man in the middle swaps the certificate | Pinning; code not sent before the check | If the invite itself is intercepted (sent over an insecure chat), the attacker has the pin and the code. Treat the invite as a secret. |
| Invite guessing | 128-bit codes, lockout, rate limit | Negligible. |
| Invite leaked or guest should go | Revoke / rotate / panic button, kick is immediate | Anything the guest already copied stays copied. |
| Former guest reconnects with old code | Revoked codes are refused | None. |
| Code in URL ends up in logs | The relay never logs URLs; the code is in the query string because browsers cannot set headers on WebSockets | Reverse proxies or tunnels the host adds may log it. Use short invite lifetimes. |
| Brute force from one address | Temporary lockout, exponential | Attacker with many addresses is still bounded by 128-bit codes. |
| Connection or message flood | Per-address and per-connection limits, 5 MB cap | A valid guest can still send up to 1 MB/s of edits; the host sees slowdowns, not a crash. Per-guest quotas on stored document size are not done yet. |
| Cross-site WebSocket from a web page | Origin allow-list + code needed | If the host leaves `allowedOrigins` unset, any page that knows a code could connect; the code is still required. |
| Relay exposed to the internet by port forwarding | TLS + codes + limits | Not recommended. Prefer a tunnel or LAN. DoS by many sockets is only partly handled. |
| Guest writes a hostile path (`../`) | `paths.mjs` checks (spike) | Unchanged by this slice. |
| Viewer writes | Dropped by relay (spike) | Unchanged. |
| Host machine compromise | Out of scope | |

## Alternatives considered
- Application-layer encryption of Yjs updates (shared key in the invite): no certificate handling, but the relay then cannot hold the document for late joiners, and key revocation means re-keying everyone. Rejected for now. It could be layered later for relays hosted by a third party.
- Trusted CA certificate (Let's Encrypt): needs a public domain and internet; does not fit a LAN session.
- Noise / libp2p style handshakes: more moving parts than the use case needs.

## Not done / next
- Wire into the app: the host UI (invite list, copy link, revoke button, panic button) and the guest "join with link" flow.
- Tauri host: moving cert generation to Rust (rcgen) is optional; the JS version works in the Node sidecar.
- Browser guests (web app): browsers cannot pin a self-signed certificate and will show a warning for wss:// to a LAN IP. Options: the web app joins only through a tunnel with a real certificate, or guests use the desktop app. Needs a product decision.
- Windows firewall prompt appears when binding a non-loopback address; expected.
- Per-guest document size quota, audit log of joins and revokes.
- Independent review before any "enterprise" claim.
