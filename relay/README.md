# somnia-relay

A small, self-hostable WebSocket relay for Somnia collaboration (ADR-005,
internet fallback). It is **blind on purpose**: it forwards only opaque binary
frames between the members of a room and stores nothing. All content is
end-to-end encrypted by the clients (Yjs document updates and awareness
states); the relay never sees plaintext, never inspects payloads, and has no
document state to leak.

One honest paragraph up front: this relay is new code. It is tested on Linux
x86_64 (18 automated tests, plus the load test below). It has **not** been run
on Windows or macOS, it has **not** been tested between two real machines (that
acceptance test belongs to the desktop app), and it has **not** been exposed to
the public internet. Deployments behind a real reverse proxy are the intended
shape; everything else is unverified.

## What it does / does not do

| Does | Does not |
|---|---|
| Fan out every binary frame to the other members of the room | Store, replay, or inspect frames (an empty room holds no state; a late joiner receives nothing until a live peer sends) |
| Admit connections per room id | Accounts, passwords, or per-user auth — the room id is the only credential |
| Rate-limit handshakes (per IP), traffic (per connection), frame size, room count, members per room | Terminate TLS (your reverse proxy does that) |
| `/healthz` for proxy/monitor checks | Log room ids or payloads (room ids are logged as an 8-char SHA-256 prefix) |
| Disconnect slow consumers with close `1013` so they resync, instead of silently dropping sync data | Guarantee delivery across disconnects — clients resync among themselves (Yjs sync step 1) |

The Somnia desktop app stays the only disk writer. The relay is transport only.

## Wire contract (v0, interim)

Coordinated with the collab protocol workstream; until the final encrypted
frame format lands, the contract is "room id + opaque binary frames":

- `GET /room/<room-id>` upgrades to WebSocket. Room id: 8-128 chars of
  `A-Z a-z 0-9 - _`, generated with at least 128 bits of entropy.
- `GET /healthz` answers `200 ok` over plain HTTP (no upgrade).
- Any other path answers `404` with no banner.
- After the upgrade the client sends **binary frames only**. Each frame is
  forwarded verbatim to every other member of the room; the sender never
  receives its own frame back.
- Close codes a client must understand:
  - `1003` - a text (non-binary) frame was sent
  - `1008` - per-connection send budget exceeded (rate limit)
  - `1009` - frame larger than `--max-frame-bytes` (tungstenite built-in)
  - `1013` - the client was too slow to receive; **reconnect and resync from
    scratch** (the relay never buffers per client beyond
    `--broadcast-capacity` frames)
  - `1001` - relay is shutting down
- HTTP errors before the upgrade: `404` (unknown path/invalid room id), `429`
  (per-IP handshake or connection limit), `503` (room full / relay busy).

There is no relay-side sync state. Peers exchange Yjs sync-step-1/sync-step-2
and updates among themselves through the room; a peer that joins an empty room
must get the document from a live peer (in practice: the host stays online).

## Quickstart

```sh
cargo run --release --bin somnia-relay
# listening on 127.0.0.1:8787 (plain ws - put a TLS reverse proxy in front)
```

Docker:

```sh
docker build -t somnia-relay relay/
docker run --rm -p 127.0.0.1:8787:8787 somnia-relay
```

The image is a distroless non-root container. Inside Docker the binary binds
`0.0.0.0:8787` by default (overridable, see below); publish to localhost when
the proxy runs on the same host.

## Configuration

Every flag has an env var; the flag wins.

| Flag | Env var | Default | Meaning |
|---|---|---|---|
| `--bind` | `SOMNIA_RELAY_BIND` | `127.0.0.1:8787` (`0.0.0.0:8787` in Docker) | Listen address |
| `--max-frame-bytes` | `SOMNIA_RELAY_MAX_FRAME_BYTES` | `2097152` (2 MiB) | Largest relayed frame |
| `--max-rooms` | `SOMNIA_RELAY_MAX_ROOMS` | `256` | Open rooms |
| `--max-clients-per-room` | `SOMNIA_RELAY_MAX_CLIENTS_PER_ROOM` | `16` | Members per room |
| `--broadcast-capacity` | `SOMNIA_RELAY_BROADCAST_CAPACITY` | `256` | Frames buffered per room before a slow member is disconnected (`1013`) |
| `--handshakes-per-min` | `SOMNIA_RELAY_HANDSHAKES_PER_MIN` | `60` | TCP attempts per source IP per minute |
| `--max-open-per-ip` | `SOMNIA_RELAY_MAX_OPEN_PER_IP` | `32` | Open connections per source IP |
| `--frames-per-sec` / `--frame-burst` | `SOMNIA_RELAY_FRAMES_PER_SEC` / `SOMNIA_RELAY_FRAME_BURST` | `100` / `300` | Per-connection frame budget (token bucket) |
| `--bytes-per-sec` / `--byte-burst` | `SOMNIA_RELAY_BYTES_PER_SEC` / `SOMNIA_RELAY_BYTE_BURST` | `1000000` / `5000000` | Per-connection byte budget (token bucket) |
| `--heartbeat-secs` | `SOMNIA_RELAY_HEARTBEAT_SECS` | `30` | Server ping interval |
| `--heartbeat-timeout-secs` | `SOMNIA_RELAY_HEARTBEAT_TIMEOUT_SECS` | `75` | Drop connections silent for this long |

Logging: `RUST_LOG=somnia_relay=debug` for more, default `info`.

## TLS: your reverse proxy owns it

The relay speaks plain WebSocket and must not be exposed directly. Terminate
TLS at your own reverse proxy and forward to `127.0.0.1:8787`.

**Caddy** (`Caddyfile`):

```
relay.example.com

reverse_proxy 127.0.0.1:8787
```

Caddy handles WebSocket upgrades and Let's Encrypt automatically.

**nginx**:

```nginx
server {
    listen 443 ssl;
    server_name relay.example.com;
    # ssl_certificate / ssl_certificate_key: your cert (e.g. certbot)

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_read_timeout 3600s;  # long-lived sockets
    }
}
```

Clients then use `wss://relay.example.com/room/<room-id>`.

Notes:

- Per-IP limits count the direct peer address. Behind a proxy every client
  appears as the proxy's IP unless the relay learns to trust
  `X-Forwarded-For`; **it currently does not** (a spoofable header must not
  become an auth signal without a trusted-proxy config). For now, size
  `--max-open-per-ip` and `--handshakes-per-min` for "all users share one
  address" when you run behind a proxy, or run the proxy on the same host and
  accept the coarser limiting. This is a known limitation, flagged in the
  internet-connectivity research (ADR-005).
- Keep room ids out of access logs where you can. The id is the room's only
  credential: `wss://host/room/<id>` appears in default proxy logs. Short
  session lifetimes limit the damage.

## systemd (example)

```ini
[Unit]
Description=Somnia collaboration relay
After=network-online.target

[Service]
ExecStart=/usr/local/bin/somnia-relay --bind 127.0.0.1:8787
Restart=on-failure
User=somnia-relay
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

## Security model

- **Blind forwarding.** Payloads are end-to-end encrypted by the clients; the
  relay has no key and no plaintext. Compromising the relay yields connection
  metadata (IPs, timing, sizes) and nothing else - that metadata *is* visible,
  same as any relay.
- **The room id is the credential.** Anyone with the id can join the room and
  receive everything sent to it. Generate ids with >=128 bits of entropy,
  treat them like passwords, rotate them per session.
- **No persistence.** Rooms vanish when the last member leaves; nothing is
  written to disk, ever.
- **Abuse controls.** Per-IP handshake and connection caps, per-connection
  frame/byte token buckets, frame-size cap, room and member caps, heartbeat
  timeouts. A valid room member can still spend up to its traffic budget; that
  is by design (host sees slowdown, not a crash).
- **Close codes are part of the protocol.** Clients must handle `1013` by
  resyncing; it is how the relay says "you were too slow, your view is stale".

This is a transport component, not the whole security story: viewer-role
enforcement, invites and revocation live in the app layer (see
`phase1/notes/ADR-005-threat-model.md`).

## Load test

Developer tool, not a benchmark suite. Run against a local relay:

```sh
./target/release/somnia-relay --max-open-per-ip 2000 --handshakes-per-min 20000 &
cargo run --release --bin loadtest -- --clients 128 --rooms 8 --duration 15 --send-rate 50
```

Measured on this workspace (2026-10-06, 2 vCPU / 2 GB RAM Linux container,
loopback, relay and loadtest on the same machine, release build):

| Scenario | Sent | Fanned out | Latency p50/p95/p99 | Errors | Lost |
|---|---|---|---|---|---|
| 64 clients, 8 rooms, 20 fps each, 1 KiB frames, 15 s | 1,281/s | 8,951/s | 5 / 43 / 45 ms | 0 | 0 |
| 128 clients, 8 rooms, 50 fps each, 1 KiB frames, 15 s | 6,408/s | 95,918/s | 11 / 20 / 21 ms | 0 | 0 |

Read these as "a tiny relay on two cores fans out far more than a handful of
collaborators will ever type", not as a capacity promise. Real sessions are a
few people per room; per-room traffic is what matters, and the per-connection
budgets above cap that. Re-run the tool on your own hardware before quoting
numbers.

## Development

```sh
cargo test                     # 18 tests: limits, rooms, end-to-end websocket
cargo clippy --all-targets -- -D warnings
cargo fmt --check
```

Layout: `src/lib.rs` (room-id rules, log tags), `src/limits.rs` (token
buckets, per-IP admission), `src/rooms.rs` (room registry + fan-out),
`src/server.rs` (accept loop, handshake, reader/writer), `src/main.rs` (CLI),
`src/bin/loadtest.rs` (load tool), `tests/integration.rs` (end-to-end).

### Managed room lifecycle (v1)

New Somnia clients create `m1_<expiry>_<host-capability digest>` rooms. Only the
host's separate capability can create one; guests cannot create or reopen it.
Host disconnect ends the room (close 4001), and absolute expiry closes every
member (4004). Admission validates expiry and rejects expired rooms. Management
uses URL metadata only; document frames are still opaque. Ended-room tombstones
are bounded and memory-only: restart forgets them, although a guest still cannot
recreate an ended room without the host capability. Deploy this relay version
with the managed-session client. Old unmanaged rooms remain supported. See
`phase1/notes/collab-security.md` for the wire contract, viewer limits and trust
model. Use TLS on untrusted networks because host capabilities travel in upgrade
queries, never log query strings at your reverse proxy, and do not publish host
connection URLs.
