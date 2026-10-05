# Identity, roles, presence and local undo

Status: standalone collaboration prototype, based on PR #108. No desktop UI, installer, account system or release changes.

## Identity and access

Every `relay.invite(role, hostname, name)` call now creates a different random bearer credential and a session-local UUID. Store that URL and reuse it for reconnect. Calling `invite` again creates another guest, not another connection for the same person. Only one live connection is allowed per identity. The host credential is never issued by `invite`.

This is identity within one collaboration session, not proof of a person's real identity. A copied URL can be used by somebody else. Names are self-reported labels, trimmed to 64 characters. Guest-supplied ids and roles are ignored. Identities are in memory only and expire for new connections; expiry does not end an already connected session. Revocation ends that session immediately.

The relay decides the current role on every incoming message:
- Host: edits, guest role changes, guest revoke/kick.
- Editor: edits and own cursor/presence.
- Viewer: state requests and own cursor/presence only. Both sync step2 and incremental updates are dropped.

Guests cannot promote themselves or other guests. Guest roles are only editor/viewer. Host cannot be kicked or downgraded. `Session.setGuestRole(id, role)` and `Session.kickGuest(id)` send authenticated host commands. Local host process equivalents are `Relay.setRole`, `Relay.kick` and `Relay.revoke`. Kick deliberately revokes the credential too, rather than allowing an immediate reconnect. Re-inviting someone requires a new guest URL.

## Presence contract

`Session.identity` is `{ id, role, name }`. `Session.people` and `Relay.presence()` return connected people with `{ id, role, name, connected: true, awarenessId }`. No bearer credentials are included. Use the UUID as the list key, never a name or Yjs client id. The list arrives in frame type 2 and updates on join, cursor/name updates, role change and leave. A UI can render it later; this slice provides the model, not a visual list.

Awareness is restricted to one Yjs client id per socket. A guest cannot overwrite or remove somebody else's cursor. Only `user` (server-owned id/role, self-reported name) and validated `{ path, index }` cursors are forwarded. Other arbitrary awareness fields are stripped. The client no longer echoes remote awareness frames, which otherwise let one socket claim other people's ids. Frame types must use the canonical one-byte headers; the old first-byte role check could otherwise be bypassed with an alternative varuint encoding.

Core sync framing in `protocol.mjs` is unchanged. Extensions are in `identity-protocol.mjs`. Browser/Tauri integration must understand frame 2 and supply the client's WebSocket adapter. Do not assume a stock y-websocket provider implements these controls.

## Undo design and tested behavior

`Session.edit(() => ...)` runs a transaction with this client's unique local edit origin. `Session.undo()` and `.redo()` use a `Y.UndoManager` scoped to the files map and its nested text. Remote sync and default/system transactions are not tracked. File creation in an edit is tracked. Undo removes that person's edit while retaining another person's later edit; redo was tested too.

One explicit edit call is one undo group (`captureTimeout: 0`). CodeMirror bindings must pass this same origin or add their own local-only origins to the manager; design operations should wrap their text changes in `edit`. Direct `file(...).insert(...)` still works for the existing spike and intentionally does not enter user undo. This is not yet wired to Ctrl+Z or the app's command stack. History is local, not restored after restart or when constructing a new Session. Role change clears history and viewer edit/undo/redo wrappers throw. Offline editors can still edit with their last role; relay authorization remains the authority when reconnecting.

Raw Yjs objects are still exposed. A malicious viewer can alter its own local document, but those writes do not reach the relay. Such a locally polluted document must be replaced before later promoting it: promotion with that same document can resend its previously rejected edits on reconnect. A production viewer UI must be read-only and role/reconnect changes need a clean document resync. Revocation cannot delete document data a guest already received. Plain `ws://` remains localhost-only for safe testing; LAN encryption belongs to the transport slice.

## Files and integration notes

New modules: `identities.mjs`, `identity-protocol.mjs`, `owned-awareness.mjs`, `user-undo.mjs`. Shared changes limited to `relay.mjs` and `session.mjs`; dependencies and package scripts unchanged. Added ten acceptance/security tests in `test/identity.test.mjs` and a local walkthrough in `identity-demo.mjs`.

Sibling integration must preserve the per-message role lookup, frame-2 host control gate, owned-awareness validation and local undo origin. It must not treat names as authenticated accounts. Invitations/reconnect code should retain the same per-guest URL. Save/disk behavior is untouched.

## Windows acceptance

With Node 22+ installed, in PowerShell from the repo root:

```powershell
cd phase1/prototypes/collab-spike
npm ci
npm test
node identity-demo.mjs
```

Expected: 22 tests pass. Walkthrough prints a three-person table with host/editor/viewer, then PASS lines for own undo keeping Bea's edit, editor downgrade blocking edits, and kick preventing reconnect while the other viewer remains connected. It binds only 127.0.0.1, writes no project files and needs no LAN/firewall configuration. This is a prototype test, not a Windows desktop feature test. Linux Node 22 execution was checked; actual Windows execution is still to be done by Philipp.
