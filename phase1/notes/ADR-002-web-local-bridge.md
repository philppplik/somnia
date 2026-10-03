# ADR 002: Web to local bridge

Date: 2026-10-03
Status: proposed. Needs a product decision from Philipp before any code.

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
