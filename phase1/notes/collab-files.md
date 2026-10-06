# Collaboration: multi-file sync and media blobs (v11/collab-files)

Branch `v11/collab-files`, based on phase1-foundation (v10.2.0). Same two modes as before (LAN-Direct host,
self-hosted relay), same E2E link key, no central server. Nothing here is a placeholder.

## What syncs now

| Thing | Before | Now |
|---|---|---|
| Text files (html, css, js, json, svg, txt, md): content, creation | yes | yes (unchanged) |
| Delete and rename of text files | no | yes (`projectBridge.ts`; rename = delete + create) |
| Images and PDFs (PNG, JPEG, PDF) from opened folders | no | yes, as in-memory previews (Files > Previews) |

### Delete / rename
A file this window synced and that is now gone from a non-empty project is removed from the shared project.
The other side removes it through `ProjectPort.remove` (editor-core `deleteFile`). Safety rules:
- An emptied or closed project never deletes anything (guards `closeCore`, adopt).
- A remote delete does not discard fresh local work: a file this window changed in the last 30 s, or whose text
  differs from the last synced text, stays and is shared again. Creation is not an edit, so create-then-rename works at once.
  A blind relay has no acknowledgements, so a time window is the honest limit for concurrent delete vs. edit.

### Media blobs
Binary data cannot live in the Y.Doc: the sync handshake sends the whole document in one frame and the relay closes
connections at 2 MiB (1009). So:
- **Manifest** in the doc: `Y.Map 'media'`, path -> `{hash: sha-256 hex, size}`. Late joiners get it with the normal handshake.
- **Bytes** travel in a new frame type `MSG_BLOB` (4), always inside `MSG_ENCRYPTED` when the link has a key (the app always
  creates a key). Pull-based and content-addressed: `REQUEST(hash, firstChunk, count<=8)` and `CHUNK(hash, index, total, data)`.
  Chunk = 128 KiB. Any peer holding the blob can answer (host or another guest), so it works through a blind relay and in LAN-Direct.
- **Pacing**: answers go out at <= 400 kB/s by default, below the relay's 1 MB/s per-connection budget (exceeding it closes the
  connection with 1008). A responder waits a random 0-120 ms and stays quiet if it hears the chunk from someone else.
- **Verification** before the app sees bytes: manifest entry validated (safe path, .png/.jpg/.jpeg/.pdf, size 1 B-25 MB,
  hash format), chunk index/total/length checked, final sha-256 compared. Mismatch: discarded, re-requested twice, then reported
  as `corrupt`. The app's own magic-byte check runs after (`addMediaFile`); a refusal is reported as `refused`.
- **Limits**: 200 files, 60 MB per session, 4 parallel downloads, <= 64 queued answers. Over the limit is reported (`limit`), not silent.
- **Status** (`CollabSnapshot.media`: shared / received / pending / failed[]) comes from the real transfer and shows in the
  status pill tooltip (`collab.media`, all five locales).
- **Conflicts**: same path, different bytes: a window that never held a different version adopts the remote one; a window that
  replaced its own synced file publishes the replacement (last writer wins in the map).

Files: `net/blobProtocol.ts`, `blobSync.ts`, `appMedia.ts`; wiring in `realEngine.ts` (`EngineDeps.media`), `net/client.ts`
(`sendBlob`, `setBlobHandler`), `store.ts`.

## Honest limits
- Received media lives in memory only (like all media in the app). It is **not** written into the host's project folder:
  writing guest-supplied binaries to the host's disk needs its own permission design.
- A blind relay cannot enforce roles: a viewer can publish a manifest entry. The hash binds bytes to the manifest, not trust to the author.
- No peer online who has the file = `unavailable` after ~16 s; it is retried when someone new joins.
- Without an E2E key (spike relay, `?code=` links) blob frames would be sent in the clear and the spike relay does not know
  type 4. The app always uses a key; this was not tested against the spike relay.
- Concurrent delete + edit: see 30 s window above. Folders (empty directories) are not shared.
- Tested with in-memory transports (real frames, real E2E crypto, blind relay) only. Not run against the Rust relay or LAN host
  over real sockets, not on Windows, not between two machines. The Rust relay forwards binary frames verbatim, so no relay change is needed.
- Media sent over Relay is not covered by Playwright E2E.

## Tests
`blobSync.test.ts` (12): frame codec, manifest validation, multi-chunk image + PDF byte-exact over an encrypted blind relay,
ciphertext-only on the wire, late joiner + duplicate-answer suppression, replacement, corrupt bytes, wrong-size/unrequested
chunks, unavailable then kick, app refusal, pacing, limits. `bridgeFiles.test.ts` (3): create/delete/rename both ways,
fresh local edit survives remote delete, closed project deletes nothing. `realEngine.test.ts` +1: full engine session with media.
`npm run test:core`: 398 tests green; `npm run build` and `tsc --noEmit` clean.
