# Session chat and participant badges

Base: `somnia-agent` at `2ec9f26`. No cloud service, no new relay process.

## Architecture

- `ChatModel` owns a separate volatile Y.Doc (`messages`, `order`, `colours`,
  `media`, `meta`). It is never handed to the project bridge, disk save, recovery,
  export or agent context.
- `MSG_CHAT_SYNC=5`, version 1, carries normal Yjs sync submessages inside the
  existing AES-GCM link-key envelope. No-key sessions cannot send chat. Old
  clients ignore this channel. Reconnect sends both state vector and full chat
  state so offline edits do not depend on another peer sending step1.
- The host gives pending messages a sequence; UI says "Shared with session",
  not "delivered to everyone". This is cooperative confirmation, not signed
  authorship. Every key holder can still forge IDs/sequence values.
- Participant IDs are UUIDs stable through reconnect of the same running
  session. The host assigns eight colour tokens; later people reuse colours,
  with visible initials and names. All eight palettes pass 4.5:1 badge text tests.
- `remoteSelections` replaces ONLY the upstream remote widget layer. The
  upstream Yjs binding/undo remains. Widgets carry participant IDs, not names,
  so people with equal names do not get each other's badges. Relative positions
  must resolve to the active Y.Text; scoped awareness also checks the file.
- Badge opacity follows local receipt of actual activity/cursor changes, not
  heartbeat timestamps. 4 s activity window, 200 ms fade, no fade with reduced
  motion. Activity / Always / Never are in Settings > Collaboration.
- The right communication panel has Agent and Chat tabs. Switching tabs leaves
  the mounted agent and its running request intact. Opening Chat does not focus
  the composer. Ctrl/Cmd+Shift+C opens it. Messages are plain text, with one-level
  replies, ID mentions, explicit code-location jumps and local unread state.
- Browser paste/drop/file picker stores attachments only in the chat store.
  Native OS drop routing uses the existing Rust grant and physical drop position;
  it never grants reads from renderer-supplied paths. The chat flag reads bounded
  binary bytes rather than importing the file as a project.
- BlobSync is reused with a separate doc/port and stricter chat policy. SHA-256,
  128 KiB chunks, exact chunk length, pacing and retry/unavailable behavior remain.
  Pending cards display actual received bytes. Only committed attachments get a
  manifest; drafts are not shared. Generic files are octet-stream/download-only.
  PNG/JPEG previews additionally use a decode/pixel budget. PDF is download-only,
  never embedded into an executable document viewer.
- Chat store, timers, draft files, object URLs, unread state and doc are cleaned
  on leave and terminal error (including expiry/revocation). Downloaded files or
  screenshots outside Somnia cannot be remotely erased.

## Limits

8 KiB UTF-8 text/message, 500 visible messages, 512 KiB visible history,
10,000,000 bytes/attachment, 5 attachments/message, 50,000,000 bytes and 100
attachments/session. A visible notice explains trimmed history. No attachment
bytes or large Data URLs enter Yjs. A chat frame larger than the relay cap is
not sent, protecting the project socket from close code 1009.

## Verification in this change

- `npm run build`: green (existing Vite chunk/import warnings remain).
- `npm run test:core`: full suite green. Three pre-existing integration skips
  depend on prototype relay dependencies. Exact final counts are in handover.
- New core checks: same-name identity/fade colour policy, relative-position/file
  validation, separate docs, duplicate updates, host order versus skewed clocks,
  UTF-8 limits, metadata validation, replies/mentions, late join, version mismatch,
  three encrypted protocol clients, reconnect/offline edits, chunked attachment
  transfer/progress, URL cleanup and interrupted attachment preparation.
- New Playwright checks: Light/Dark app views, messages/replies/mentions, PDF and
  image cards, paste/drop isolation, closed mentions/unread, name collisions,
  activity fade/hover/Never, reduced motion, Settings, German text and keyboard
  opening without focus theft. Evidence screenshots are only in `test-results/`.
- Existing Agent panel, collaboration-share and Settings tests were rerun.

## Acceptance gaps and explicit non-guarantees

- No real Windows/WebView2, two-PC LAN/firewall or native OS drop test was run.
  Rust changes need the builder's native CI. This environment has no Cargo.
  Browser tests use real app components and local synthetic presence; protocol
  tests use independent real Yjs/client instances over a blind in-memory relay,
  not the Rust relay executable.
- This base has no shared Canvas pointer presence. No fake Canvas cursor was
  added. Code badges are implemented; Canvas requires a separate presence feature.
- History limits bound visible content, not total CRDT tombstones over an
  arbitrarily long session. Host-coordinated epoch compaction is not implemented.
  Extremely long sessions can exceed the chat snapshot cap. The project socket
  is protected, but chat late join then needs a fresh session.
- Attachment fetching is eager for committed messages, not lazy/on-demand. There
  is no individual pause/cancel transfer UI; unavailable states come from real
  retry exhaustion. One 128 KiB paced chunk may precede text, not an entire file.
- Code references currently use explicit file/line fallback, not retained Yjs
  relative-range references across edits/renames. They never navigate automatically.
- Badge collision offsets and edge flips are implemented, but complex wrapped
  multi-line selections, high-DPI and many crowded cursors need native visual QA.
  Cursor interpolation, optional join/leave announcements and follow mode are
  not new features in this patch.
- Mentions persist participant IDs from the picker; display chips are plain-text
  rendering. Editing a previously inserted mention does not re-resolve its ID.
- Attachment type/hash checks are not a virus scanner. Generic files are never
  auto-opened or sent to AI. The eight colours may coincide with a user's custom
  accent; initials/names remain the distinguishing channel.
