# Collaboration Share/Join UI (ADR-005, slice 1)

Branch `collab/share-ui`, based on PR #108 (`feature/collab-spike`). UI only. No network code in the app yet.

## What it does
- Tools > **Share project...** opens a dialog. The host picks "this computer only" or "local network", and how long invites last (15 min, 1 h, 8 h), then starts sharing.
- The host sees one invite link per role (**Can edit**, **View only**) with a countdown, Copy link, Show/Hide code, and **New link** (the old link for that role stops working). The code is masked until shown or copied. A people list shows who is in.
- Tools > **Join shared project...**: guest pastes the link, optionally enters a name, and joins. Clear messages for: not an invite link, host not reachable, code refused, expired, too many wrong codes, session full.
- Status bar pill (next to the update pill): `Sharing`, `Sharing with N`, `Joined (Can edit | View only)`, `Connecting...`, `Reconnecting...`, `Not connected`. Click opens the dialog. Hidden when idle.
- Local-network links show a plain warning that they are not encrypted yet (spike finding 1). A pasted non-local `ws://` link shows the same kind of note.

## Structure (new files, minimal shared edits)
- `src/lib/collab/types.ts` - `CollabEngine` interface and state shapes. This is the seam.
- `src/lib/collab/store.ts` - active engine (`setCollabEngine`), React hooks, dialog open state.
- `src/lib/collab/invite.ts` - link parsing/validation, masking, expiry text. Pure, unit tested.
- `src/lib/collab/loopbackEngine.ts` - in-memory stand-in that follows the spike relay rules (per-role codes, expiry, 5 bad tries then block, max clients). Default engine until the real one exists.
- `src/lib/collab/commands.ts` - registers the two commands (category Tools).
- `src/components/ShareDialog.tsx`, `src/components/CollabStatus.tsx`.
- Shared-file edits: `src/App.tsx` only (3 one-line inserts: two imports, `<CollabStatus/>`, `<ShareDialog/>`).

## Plugging in the real relay
Implement `CollabEngine` (Tauri-side relay for `startHosting`, y-websocket client for `join`) and call `setCollabEngine(realEngine)` at startup. Map relay refusal codes to `CollabError.kind`. The UI needs nothing else. The loopback engine should then be dev/test only.

## Tests
- `src/lib/collab/invite.test.ts`, `loopbackEngine.test.ts` (node test, part of `npm run test:core`).
- `tests/collab-share.spec.ts` (Playwright, 4 tests).

## Known limits
- Not connected to any real network or editor; two real people cannot collaborate with this branch alone.
- Roles are per link, not per person (spike finding 2). No kick/revoke of one guest yet; "New link" only stops new joins.
- Strings are hardcoded English.
