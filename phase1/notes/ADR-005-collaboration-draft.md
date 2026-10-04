# ADR-005 (draft): Collaborative editing of a local website

Status: draft, concept only. Nothing is built. Asked by Philipp on 2026-10-04: edit a locally stored site together, Google Docs style, on the same network or remote.

## What we have
Editor-core owns the source text of the open project and applies structured operations (setText, setStyle, insertHTML, move, remove, replaceSource) with undo. Files are saved through the File System Access API (web) or the native app (desktop). Everything is local, no server, no accounts.

## Options
### A. Yjs CRDT as the document model
Each project file becomes a `Y.Text`; the file list a `Y.Map`. CodeMirror 6 has a maintained binding (`y-codemirror.next`), including remote cursors and selections. Merging is automatic and offline-tolerant.
- Fit: good for the code editor. For design edits we map our operations onto text edits of the source, which Yjs merges as text. Two people moving the same element can still produce valid-but-surprising HTML; we need a re-parse and a validity check after each remote update.
- Cost: editor-core must accept "external" text changes without breaking undo. Undo must become per-user (Yjs `UndoManager`).

### B. Operational transform or a central lock
Simpler semantics (one writer at a time per file or per element) and no new data model, but needs a coordinating server and poor offline behavior. Fine as a stopgap ("follow mode", per-file lock).

### Transport
1. **WebRTC peer to peer** (`y-webrtc` or `y-webrtc`-style signaling). No server holds the project. Needs a small signaling service (can be a free tiny relay) and STUN; behind strict NATs a TURN relay is required, which costs money and sees encrypted traffic only. Works on the same network without internet if signaling is local.
2. **Local relay** inside the desktop app: a WebSocket server on the host's machine (`y-websocket` protocol), reachable over LAN. Simple and fast on one network. Windows firewall prompts, and the browser version cannot host it.
3. **Tunnel for remote**: a tunnel (Cloudflare Tunnel, ngrok, tailscale) exposes option 2 to the internet. Convenient, but adds a third party and an externally reachable endpoint.

Recommendation: Yjs plus a local WebSocket relay for LAN first, WebRTC with a minimal signaling server second.

## Permissions and safety
- A session is opt-in, started by the host, with a random invite link or code that is the only credential. No account system.
- Roles: host (owns disk and saving), editor, viewer. Only the host writes to disk; guests never get filesystem access.
- Transport encryption: WSS or WebRTC (DTLS). For LAN WebSocket without TLS the invite code must not travel in clear text, so use a pre-shared key and encrypt updates at the application layer, or require WebRTC.
- Extensions: remote operations never pass through extension APIs; extension code runs only on its owner's machine.
- Privacy: peers see all project files. Excluding paths needs an allowlist per session.

## Risks
- Source conflicts at HTML level (unclosed tags after merges). Mitigation: validate and auto-repair, show a conflict marker rather than silently fixing.
- Undo semantics, selection ids that differ per peer (editor node ids are generated locally).
- Save conflicts: the host saves, guests see "saved by host". Concurrent disk edits outside Somnia need the existing revision checks.
- NAT traversal and firewalls make "just works" hard; TURN costs.
- Security of an exposed relay or tunnel: rate limits, invite expiry, no directory traversal.

## Effort (rough, one developer)
- Prototype, LAN, two code editors in sync: 1 to 2 weeks.
- Design-view operations merged correctly, remote cursors in the canvas, per-user undo: 3 to 5 weeks.
- Roles, invites, encryption, signaling/TURN, hardening and tests: 3 to 4 weeks.
- Realistic total for a reliable first version: 2 to 3 months.

## Decision
None yet. If we go ahead, start with a spike: Yjs plus `y-codemirror.next` plus a local `y-websocket` relay on one HTML file, no design view, host-only saving.
