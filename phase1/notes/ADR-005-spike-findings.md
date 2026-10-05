# ADR-005 spike findings: Yjs + local relay

Status: spike result, input to the decision in ADR-005. No app code changed. Prototype: `phase1/prototypes/collab-spike`.

## What was built
Host runs a WebSocket relay. Each project file is a `Y.Text` inside one shared map. Guests join with an invite code that decides their role. The host process alone writes to disk.

## What the tests show (12 tests, all green)
- Two editors typing in the same HTML file converge on identical text.
- A late joiner gets the full project. Edits made offline merge on reconnect without loss.
- Remote cursors (awareness) appear and disappear on connect and disconnect.
- Viewers can read, but their writes are dropped at the relay and never reach anyone.
- Wrong or expired code is refused. Five bad tries from one address block it. Session size and message size are capped.
- A hostile guest can put a file name like `../escaped.txt` in the shared map. The host save skips it and writes nothing outside the project folder.
- Two people breaking structure at the same time (one deletes `</div>`, the other opens `<i>`) merge into text with an unclosed tag. The checker flags it. The source is left as is, so the users see the problem instead of a silent fix.

## Numbers (bench.mjs, one laptop-class machine)
339,000 characters, 4,000 concurrent edits: about 94 ms to apply, 61 ms to merge both sides, full state 435 KB. Text size is not a concern for normal sites.

## Recommendation
Go with Yjs plus a host-run relay for LAN first, as ADR-005 proposed. The core idea works and is small (about 300 lines). Keep the relay inside the desktop app only; the browser version can join but not host.

## Not solved (needs decisions or later work)
1. Transport security. The invite code travels in the URL over plain `ws://`. Fine on localhost, not on a shared Wi-Fi. Before LAN use: TLS, or encrypt updates with a key from the invite (key never sent to the relay), or WebRTC.
2. Roles are enforced at the relay by code. There are no per-user identities or revoking one guest. A leaked editor code works until it expires (default 1 hour).
3. Editor-core integration is untouched. Design-view operations (move, setStyle) are not mapped to text edits yet. Undo must become per user (`Y.UndoManager`). Node ids differ between peers.
4. Plain text merge can produce valid-looking but odd HTML. The checker only catches tag balance, not meaning.
5. The host's own disk changes outside Somnia are not watched. Save is whole-project; there is no conflict check against files changed on disk.
6. Remote over the internet (signaling, TURN, tunnel) is not tried.
7. The spike uses Node `ws`. The app would need the relay in the Tauri side (Rust) or a bundled sidecar, and a browser `WebSocket` client. The protocol is the standard y-websocket framing, so `y-websocket` and `y-codemirror.next` should work on the client side. That binding was not tested here.
8. Large binary assets (images) are not synced. Text files only.

## Suggested next step
Wire `y-codemirror.next` into the code editor behind a flag, host-side only, for one HTML file. Then decide on transport security (item 1) before any LAN testing with other people.
