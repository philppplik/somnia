# Managed collaboration room security

Branch `v11/collab-security`, base `619b1e6` / phase1-foundation, v10.2.0.

## What ships

New LAN and self-hosted-relay sessions use managed rooms. The host chooses 15,
60 (default), 240 or 1440 minutes. API validation allows 1-1440 whole minutes.
The UI shows the absolute end time. Stop sharing is explicitly labelled as
ending the session and invalidating its link. The host's normal socket close,
crash or detected loss also ends the room, disconnects every guest with 4001,
and prevents re-entry. Expiry closes all sockets with 4004 and refuses later
admission. Connected clients also enforce the expiry locally, without retry.
A closed-session error stays visible in the guest dialog; Leave clears it.
Guest project copies stay local. Closing the room cannot erase received data.

## Capability contract (managed-room-v1)

- Room id: `m1_<10-digit Unix expiry seconds>_<64 lowercase SHA-256 hex>`.
- Digest input: `somnia-room-v1:<expiry seconds>:<host capability>`.
- Host capability: separate 32 random bytes, encoded as 43 base64url characters.
- Host upgrade query: `?host=<capability>`. No host token appears in a guest link,
  copyable local invite, awareness, snapshot or forwarded frame. It is not the
  AES content key. Query syntax is strict: unknown or duplicate fields fail.
- Content key stays in `#key=...`. AES-GCM framing stays unchanged. Content and
  awareness remain opaque to the relay; this is room lifecycle control only.
- Only the correct host capability can create a managed room. Guests cannot
  create empty managed rooms or recreate ended rooms. A second host connection
  is refused. Expiry is digest-bound, not a client-editable permission label.
- Relay sends a binary acknowledgment (`0x04` + `managed-room-v1`) immediately
  after upgrade, before any content. Managed clients wait for it before sending
  anything. Old relays fail closed with an actionable update error rather than
  pretending to provide revocation. Old unmanaged room links remain compatible.
- Managed expiry is at most 24 hours from relay time. Client and relay clocks
  should agree; clock skew can cause earlier refusal.
- LAN start passes the exact managed room id into Rust's `allowed_room`, preserving
  the single unguessable-room restriction. Rust never receives the AES key.

## Viewer limits and trust

All holders of a guest link can read, copy and edit the shared text files and
see presence. There is no secure Viewer role. Existing spike plaintext role
commands must not be advertised as enforced read-only rights for E2E sessions.
The Share and Join dialogs say this in all five supported languages. Never
hand out this link when enforced read-only access is required.

The relay is trusted to enforce room admission and lifecycle, not trusted with
content. A hostile relay can lie about control; content secrecy does not make
it a trusted authorization service. A plain `ws://` connection exposes the
room and host capability to a network observer even though content remains
E2E-encrypted. Use `wss://` for untrusted networks; the existing warning remains.

Revocation tombstones contain only room ids and expiry, are memory-only, and
count against `max_rooms`; expired entries are swept on admission. A relay
restart forgets ended-room tombstones. Guests still cannot recreate a room
without its host capability, but a host possessing the old capability could
recreate it before its expiry after restart. Do not promise durable revocation
across relay process restarts. New normal sessions always rotate room, host
capability and AES key. Individual-guest revocation/key rotation is not offered.

Security wins over seamless reconnect: a detected host connection loss ends
the room, even if guests were still online. Start a new session to resume.
Server restart resync is still possible when the host recreates the room.
No central service, identity account, document storage or telemetry is added.

## Verification

- `npm run build` and `npm run test:core`.
- Rust `cargo test`: old unmanaged behavior plus real TCP/WebSocket tests for
  host authority, wrong/duplicate host, guest creation refusal, host-departure
  revocation, active expiry, stale/modified/overlong expiry, and opaque fan-out.
- Playwright real app windows against the real Rust relay: two-way editing,
  presence, restart resync, stop disconnecting the guest and old link failing
  re-entry. Screenshot checks cover host and revoked-guest dialogs.
- Full desktop `cargo check` needs platform GLib/WebKit development packages;
  this workspace does not have them. Windows/native LAN and installer tests
  remain the builder/Windows test responsibility, not claimed as passed.

Latest results: build passed; core 388 tests (385 pass, 3 pre-existing spike
interop skips); relay 10 unit + 10 integration tests passed (expiry race fixed
and rerun three times); browser 3 real-relay tests + 5 Share/Join tests passed.
