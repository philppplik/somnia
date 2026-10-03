# ADR 002: Web to local bridge

Date: 2026-10-03
Status: decided by Philipp on 2026-10-03 (WhatsApp, "Option B"): browser File System Access API, no install. Implementation plan below. Options A and C stay documented as later add-ons.

## Context
BACKLOG and WEBAPP-BACKLOG-2026-10-02 confirm the direction: the web app should be able to work on a project that lives on the user's disk, with trustworthy save and conflict reporting. Hard rules already set there:
- No unauthenticated localhost write service.
- No silent folder access. Folder permission is explicit and scoped.
- Connection state is always visible.
- One shared project/change model, so browser copies, disk changes and remote commits are not competing sources of truth.

The desktop app already has the revision-checked save, recovery and conflict model (NATIVE-CONTRACT.md). Any bridge should reuse that contract, not invent a second one.

## Options

### A. Desktop app as the companion (authenticated loopback)
The Tauri app exposes a local WebSocket or HTTP endpoint bound to 127.0.0.1. The web app connects after the user approves a pairing in the desktop app.
- Security: per-pairing random token, exact Origin allowlist, token shown only in the desktop UI, short-lived sessions, project-scoped (a pairing grants one folder). Browser mixed-content and Private Network Access rules need testing per browser.
- Pros: works in every browser, reuses the existing native save/recovery/conflict code, folder scope is already the picker.
- Cons: user must install and run the desktop app. A local server is an attack surface and needs careful review.

### B. Browser File System Access API
The web app asks the user for a folder directly in the browser.
- Pros: no install, no local server, permission prompt is built into the browser.
- Cons: support is Chromium-only as far as I know (to verify against current docs before deciding), permission can lapse between sessions, and the revision/recovery model would have to be rebuilt in the web layer.

### C. GitHub as the bridge (no local link)
The web app works on a repo through the GitHub API (branch, commit, PR); the desktop app syncs the same repo with git.
- Pros: no local server, history and conflicts are handled by git, fits the "commit/push is not deploy" rule.
- Cons: needs an OAuth account grant (Philipp's approval), network is required, it is not live editing of local files, and it is a second integration to build.

## Recommendation (for discussion)
Treat these as layers, not rivals:
1. Shared project/change model first (needed by all options).
2. Option A for the first bridge, because it reuses the tested native core and works in all browsers.
3. Option C later, as the remote/collab path.
4. Option B only as an optional no-install mode if browser support is good enough when we get there.

## Decisions needed from Philipp
1. Is "desktop app must be installed" acceptable for local folder access on the web (option A)?
2. Is a Chromium-only no-install mode (option B) worth building at all?
3. When GitHub comes in, which account grant and default scope (private repos only?) does he approve?

## Not decided here
Wire protocol, pairing UX, token lifetime. These follow once the option is chosen.

## Decision
Option B. The web app opens a project folder directly with the File System Access API. No companion app, no local server.

## Browser support (checked 2026-10-03)
- `showDirectoryPicker` works in Chromium desktop browsers (Chrome, Edge, Opera, from version 86). Brave only behind a flag. Chrome docs: https://developer.chrome.com/docs/capabilities/web-apis/file-system-access
- Firefox: not supported, Mozilla's standards position is "harmful". Safari (macOS and iOS): not supported. caniuse: https://caniuse.com/native-filesystem-api and https://caniuse.com/mdn-api_window_showdirectorypicker
- MDN marks it limited availability, experimental, secure context only (HTTPS or localhost), and it needs a user click: https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker
- The Origin Private File System (`navigator.storage.getDirectory`) works in all major browsers, but it is a sandbox, not the user's real folder. Source: https://www.w3tweaks.com/html/file-system-access-api-save-to-disk/ (secondary source, verify before relying on it).
- Not verified: browser market share for Philipp's target users, and whether `FileSystemObserver` (change notifications) is usable without a flag.

Consequence: local folders work in Chrome/Edge/Opera only. In Firefox and Safari the app must say so clearly and offer the fallback below.

## Save model in the web
Reuse the native contract (NATIVE-CONTRACT.md) so UI, save states and the conflict screen stay the same. Only the adapter changes (a `WebFsAdapter` next to `desktopAdapter`).
- Revision: `{exists, hash}` where hash is SHA-256 of the file bytes (SubtleCrypto). Read on open, kept per file.
- stage_edit equivalent: every edit is journaled in IndexedDB before the UI counts it as staged. A rejected or failed journal write leaves the document dirty.
- save: read the file again, compare its hash to `expectedRevision`. If it differs, stop and open the existing disk comparison flow. If it matches, write with `createWritable()` (the browser writes to a temporary file and swaps on `close()`), then re-read and verify the hash. Save state shows "saved to disk" only after that verification.
- Honest limit: there is no file lock, so another program can change the file between the check and the write. The window is small and the post-write verification detects it, but it cannot be closed completely. The UI says "saved" only after verification and otherwise offers recovery.
- External change detection: no reliable watcher. Check on window focus, tab visibility and before every save.
- Recovery: IndexedDB journal, offered on next open, never restored silently, same as native.
- Permission: the directory handle is stored in IndexedDB. After a reload the browser needs a user click to re-grant access, so the app shows "Reconnect folder" and stays read-only/dirty-safe until then. Connection state (connected, needs permission, disconnected) is always visible.
- Folder scope: one folder per project. The browser rejects sensitive locations such as system folders. Handle that error with a clear message.
- Writes only inside the chosen folder, no path traversal (reuse the existing relative-path validation).

## Fallback for Firefox and Safari
- Open a project from a ZIP or a folder upload into OPFS or memory, edit, export as ZIP (existing export). Label it "Working copy in this browser, not your folder" with the same save-state vocabulary (memory, recovery, not on disk).
- Not a promise of live disk sync.

## Plan
1. Extract the adapter interface from `desktopAdapter.ts` (port) so desktop and web share it. Test that desktop behavior is unchanged.
2. `WebFsAdapter`: open folder, list, read with hash, journal, save with verify, recovery. Unit tests with a fake directory handle, plus a Chromium Playwright test with a real temporary folder if the test runner allows the picker (otherwise OPFS-backed fake).
3. Connection UI: connect, reconnect, permission-lost states, unsupported-browser notice.
4. Fallback working copy for non-Chromium.
5. Docs and a web acceptance checklist for Philipp (Chrome on Windows).

No deploy is part of this. The web build stays a local/CI artifact until Philipp approves hosting.

## Progress
- Step 1 done: `phase1/src/lib/fileAdapter.ts` holds the save/recovery/conflict adapter behind a `FilePort` (invoke, listen, optional desktop shell). `desktopAdapter.ts` is now a thin Tauri port. Logic unchanged, 30 Playwright tests pass (desktop IPC tests included). Native Windows build not re-run locally, CI will.
- Step 2 done: `src/lib/webFsPort.ts` implements FilePort over the File System Access API (sha256 revisions, journal before staged, verify-after-write, conflict on external change, recovery list/restore/discard, path validation). 5 unit tests with fake directory handles in `src/lib/webFsPort.test.ts` (run by `npm run test:core`). Not yet wired into the UI and not yet tried with a real browser folder picker.
- Step 3 done (core wiring): in a plain browser, `main.tsx` installs the shared adapter with `createWebFsPort()` when `showDirectoryPicker` and a secure context exist; otherwise "Open folder" explains that local folders need Chrome, Edge or Opera and points to ZIP export. Web has no autosave yet: Ctrl+S writes. Playwright `tests/web-folder.spec.ts` runs open, edit, Ctrl+S against a real OPFS directory handle in Chromium (only the picker is faked). Not yet done: "Reconnect folder" after reload (handle persistence), an unsupported-browser working-copy import, a visible connection-state indicator.
- Step 3b done: "Reconnect last folder" (Project menu and command palette). `webFsPort` stores the last directory handle in IndexedDB (`somnia-web-handles`). After a reload the command asks the browser to re-grant readwrite access (needs the click) and opens the folder; without a remembered handle or without permission it shows an error and keeps the current project. Unit test in `webFsPort.test.ts`. Not tried with a real Chrome permission prompt.

### Step 4: Firefox/Safari ZIP working copy (done)
Without the File System Access API, **Open folder** asks for a ZIP. `zipWorkingCopy.ts` unpacks it into an in-memory directory handle that the same web port uses (journal, conflict check, verified write). Text files only, 20 MB cap, unsafe paths rejected. Ctrl+S writes into the tab, not to disk; the connect notice says so and **Export source ZIP** keeps the work. Force it in Chrome with `?fallback=zip`. Tests: `zipWorkingCopy.test.ts`, `tests/zip-fallback.spec.ts`. Open: web acceptance checklist for Chrome on Windows.
- Status bar shows where the project lives: green dot and "On disk" for a connected folder, amber "Tab copy" for the ZIP working copy, amber "Memory only" before any folder is connected (`data-storage`, tested in zip-fallback.spec). Closes the ADR-002 connection-indicator item.
