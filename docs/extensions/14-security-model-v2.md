# 14. Security model v2 (design proposal)

Status: design proposal, 2026-10-09. No code ships with this document. It proposes requirements for a future `apiVersion` 2 of the extension SDK, for the maintainer to accept, change or reject. Until the requirements marked **blocking** are implemented, the v1 rules stay in force: catalog packages with worker code are refused, and third-party executable extensions are not advertised as safe.

Authorship: draft for maintainer review, not yet adopted. Based on an audit of branch `somnia-agent` at `1d014e1` and the catalog index on `phase1-foundation`.

## Contents

1. [Baseline: what v1 actually guarantees](#1-baseline-what-v1-actually-guarantees)
2. [Assets and actors](#2-assets-and-actors)
3. [Permission model v2](#3-permission-model-v2)
4. [Worker isolation requirements](#4-worker-isolation-requirements)
5. [Network mediation](#5-network-mediation)
6. [Panel and UI hardening](#6-panel-and-ui-hardening)
7. [Catalog integrity](#7-catalog-integrity)
8. [Catalog review process](#8-catalog-review-process)
9. [Threat model](#9-threat-model)
10. [Migration and compatibility](#10-migration-and-compatibility)
11. [Assumptions and open questions](#11-assumptions-and-open-questions)
12. [Requirement index](#12-requirement-index)

---

## 1. Baseline: what v1 actually guarantees

The audit confirmed the following current state. Severity is the impact if a malicious extension or a compromised distribution channel is assumed.

| # | Finding | Evidence | Severity |
|---|---------|----------|----------|
| F1 | Panel HTML runs in an opaque-origin iframe (`sandbox="allow-scripts"`) with a meta CSP of `default-src 'none'`. This is a real, browser-enforced network boundary. | `panelHtml.ts`, `ExtensionPanel.tsx` | Strength, keep |
| F2 | Worker isolation is best effort. The bootstrap deletes network/storage globals before extension code runs, but this is realm patching, not a boundary. Bypass paths cannot be excluded (missed globals, future platform APIs, engine bugs). | `workerSource.ts`, `07-security.md`, ADR-003 | High |
| F3 | Native CSP conflict: the app CSP sets `worker-src 'self'`, but the runtime creates Blob-URL workers, and `script-src` lacks `'unsafe-eval'` while the bootstrap compiles extension code with `new AsyncFunction`. On the native build the worker either fails closed or the CSP has to be weakened. Either way the current CSP and the current runtime cannot both be the design. | `tauri.conf.json`, `runtime.ts`, `workerSource.ts` | High (design conflict) |
| F4 | The app `connect-src` allows `ws:` and `wss:` (any host) plus several AI/GitHub endpoints. If worker code ever regains a network primitive, these are ready-made exfiltration channels, including arbitrary-host WebSockets. | `tauri.conf.json` | High |
| F5 | Re-installing a local manifest with the same `id` replaces it silently and keeps the enabled flag and the permission set. A local "update" can add `project.write` and run immediately, without any consent. The catalog path forces the disabled state; the local path does not. | `registry.ts` (`installExtension`) | High |
| F6 | Catalog trust root is the index file itself: SHA-256 hashes pinned in a JSON file on a mutable branch (`phase1-foundation`), fetched over unauthenticated HTTPS. There are no signatures, no serial/expiry, no rollback protection. Write access to the repo (or a merged malicious PR) silently re-points hashes. | `catalog.ts` (`CATALOG_URL`), catalog `README.md` | High |
| F7 | `storage` values are capped at 20000 characters, but the number of keys is unbounded: an extension can write unlimited data into the app profile. | `api.ts` (`storage.set`) | Low |
| F8 | Command runs time out after 5 s, but activation has no timeout, and a timed-out worker is not terminated. An infinite loop burns a core indefinitely (the UI survives; battery and responsiveness do not). | `runtime.ts`, `06-lifecycle.md` | Medium |
| F9 | `editor.applyOperations` accepts `insertHTML` with raw HTML. Scripts are stripped in the internal preview, but the HTML lands in the user's project and can end up in an exported, published site (beacons, injected links, defacement). `project.write` therefore has a supply-chain dimension toward the audiences of sites built with Somnia. | `api.ts` (`WRITE_OPS`), preview rules | Medium |
| F10 | Panel bridge: inbound messages are bound to the frame via `e.source`, which is correct; replies use `postMessage(..., '*')`. Acceptable for an opaque-origin frame, but v2 should bind channels explicitly so the pattern survives future multi-frame layouts. | `ExtensionPanel.tsx`, `panelHtml.ts` | Low |
| F11 | `selection.get` deliberately returns only id and tag (no attributes), narrowing data exposure. Keep this principle; v2 adds `selection.attrs` as a separate grant instead of widening the default. | `host.ts`, ADR-003 | Strength, keep |
| F12 | Settings and secrets (Somnia Agent API keys, BYOK provider credentials, profile data) are unreachable from the extension API today. This must become an explicit invariant, not an accident of the current API surface. | `api.ts` surface | Invariant for v2 |

## 2. Assets and actors

**Assets**

1. Project content, including unsaved in-memory text of every open file.
2. The user's machine and profile: app storage, settings, secrets (agent API keys), window and identity ("act as the user's editor").
3. Integrity of produced artifacts: exported sites, HTML mails, PDFs. Content injected here reaches the *user's* audience.
4. Availability: CPU, memory, app responsiveness, project data loss.
5. Distribution channel: the catalog index, package ZIPs, reviewer accounts, signing keys.

**Actors**

- Malicious extension author aiming for catalog admission or sharing a manifest/ZIP directly.
- Compromised author account pushing a malicious update to an already-listed extension.
- Compromised repository or reviewer account changing the index.
- Supply-chain attacker through an extension's dependencies or build steps.
- Curious or careless user installing an unknown local manifest (needs honest warnings, not just technical walls).
- External attacker is *not* assumed to break the browser sandbox or Tauri webview itself; engine vulnerabilities are residual risk (see section 9).

## 3. Permission model v2

v1 permissions are flat and whole-project. v2 makes them granular, scoped, and visible. All rules below are **blocking** for apiVersion 2 unless marked otherwise.

### 3.1 Permission set

| Permission | Scope | Risk tier | Notes |
|-----------|-------|-----------|-------|
| `commands` | as v1 | low | unchanged |
| `project.read` | whole open project, unsaved text | medium | unchanged; the install dialog must say "reads all open files, including unsaved changes" |
| `project.read.file` | glob list, e.g. `["src/**/*.html"]` | low-medium | new; host resolves the glob at call time, denies outside matches |
| `selection` | id + tag | low | unchanged |
| `selection.attrs` | attributes of the selected element | medium | new; attributes carry user data (href, src, alt, meta) |
| `project.write` | whole project, undoable ops | high | unchanged op whitelist; op batches carry a mandatory `reason` string shown in the undo history ("Edited by \<name\>: \<reason\>") |
| `project.write.scope` | write limited to declared globs or to the current selection | medium | new; preferred over `project.write`; catalog reviewers push authors toward it |
| `project.write.html` | `insertHTML` / raw-HTML ops | high | new, separate grant; see SEC-P4 |
| `storage` | per-extension key/value, **total quota** | low | see SEC-P6 |
| `ui.notify` | status bar notices | low | unchanged |
| `events.project` | file/selection change events, per event type | medium | new in v2; an event stream is a read channel, so it requires the matching read permission (`events.project` + `project.read`) |
| `clipboard.read` / `clipboard.write` | clipboard | medium | new; read requires a user gesture chain (command invocation, not background polling) |
| `network` | **explicit domain list only** | high | new; see section 5 |
| `studio.<name>.read` / `studio.<name>.edit` | per-studio access (`code`, `documents`, `sheets`, `slides`, `sound`, `photos`, `video`) | medium-high | new; no cross-studio wildcard; a grant for one studio never implies another |
| `ai.query` | route text through the user's configured AI provider | very high | new; sends project content to a third-party endpoint under the user's key; install dialog names the provider; never granted implicitly; revocable mid-session |
| `git.read` / `git.commit` | history/status vs creating commits | medium / very high | new; `git.commit` requires per-action user confirmation in v2 (no blanket grant) |

Denied forever (no permission will ever unlock them): raw filesystem access, arbitrary process execution, access to app settings/secrets/keychain (F12), access to other extensions' storage or workers, camera/microphone, reading other apps' data, auto-updating its own code.

### 3.2 Grant and consent rules

- **SEC-P1 (blocking).** The install and update dialog shows every permission in plain language with its risk tier highlighted. High and very high tiers are listed first and individually.
- **SEC-P2 (blocking).** Permission diff on update: any update (local or catalog) that adds permissions, widens globs/domains, or raises a tier installs **disabled** and requires a fresh explicit enable with the diff shown. This closes F5 for the local path too.
- **SEC-P3 (blocking).** Revocation stays per permission and immediate, as in v1. Revoking `network` also tears down in-flight requests.
- **SEC-P4 (blocking).** `project.write.html` is granted separately from `project.write`. All HTML written through the API passes a host-side sanitizer (strip `script`, event-handler attributes, `javascript:` URLs, external `img`/`link` references flagged in the diff preview) unless the user explicitly confirms "insert raw HTML" per batch.
- **SEC-P5 (blocking).** `ai.query` consent names the concrete provider endpoint, is shown again whenever the configured provider changes, and every call logs provider, byte count and originating extension to a user-visible AI activity log.
- **SEC-P6 (blocking).** Storage quota becomes total: 20000 characters per value **and** 200 keys / 500 KB total per extension. Writes beyond quota fail with a clear error. Closes F7.
- **SEC-P7.** Rate limits on host API calls: 60 calls/min per extension sustained, burst 20; `project.write` additionally capped at 50 ops per call (v1 rule) and 500 ops per command run. Exceeding returns a typed error, repeated exceeding suspends the extension until the next app start.
- **SEC-P8.** Every grant is recorded (extension id, permission, scope, timestamp, app version) in the profile and exportable, so support can answer "which extension could have done this".

## 4. Worker isolation requirements

The core decision: **extension code never executes on the app origin.** The v1 model (Blob worker on the app origin + best-effort global deletion) cannot be hardened into a proven boundary and is in direct conflict with the native CSP (F3). v2 replaces it.

- **SEC-W1 (blocking).** Extension code runs inside a dedicated sandboxed iframe (`sandbox="allow-scripts"`, opaque origin, no `allow-same-origin`), reusing the panel boundary (F1). The iframe document carries a meta CSP; `connect-src` is `'none'` by default or exactly the declared `network` domains (see section 5). This makes network denial browser-enforced instead of realm-patched. Closes F2 and F3.
- **SEC-W2 (blocking).** Heavy computation may be delegated by the iframe to a Blob-URL Worker; that worker inherits the iframe's CSP, so `connect-src` is enforced there too. Workers are never created from the app document. `worker-src` in the app CSP stays `'self'` and no app-origin worker ever runs extension code.
- **SEC-W3 (blocking).** No `eval`-family execution anywhere in the extension path: no `AsyncFunction`, no `new Function`. Extension code is delivered as package source and injected as an inline script into the sandboxed srcdoc by the host (with correct escaping of `</script` sequences), which runs under `script-src 'unsafe-inline'` **without** `'unsafe-eval'`. The app CSP keeps `script-src` free of `'unsafe-eval'`.
- **SEC-W4 (defense in depth).** The global-removal list from v1 (fetch, XHR, WebSocket, indexedDB, nested Worker outside the W2 path, etc.) is retained inside the sandbox, but documentation and review never treat it as a boundary.
- **SEC-W5 (blocking).** Lifecycle limits: activation timeout 5 s (closes F8), command timeout 5 s (v1 rule kept), and the whole sandbox (iframe + workers) is terminated on timeout, disable, remove, or profile switch. Termination is the only recovery from a hung extension; there is no "keep running" state.
- **SEC-W6 (blocking).** One sandbox per extension. No shared workers, no BroadcastChannel between extensions, no shared storage. The host message protocol (JSON over postMessage) is unchanged in shape but gains a per-activation random channel token: the iframe must echo the token on every `api.call`, and the host binds replies to the frame and token. This hardens F10 for future multi-frame layouts.
- **SEC-W7 (blocking).** App CSP cleanup: `connect-src` loses the blanket `ws: wss:` entries; collaboration relays are listed explicitly or negotiated through a dedicated, audited connect mechanism. The AI provider endpoints stay scoped to the agent feature and are never reachable from extension sandboxes (they inherit the app document's CSP only on the app origin, which extensions no longer share). Closes F4.
- **SEC-W8.** Resource ceilings are best effort and stated honestly: a sandbox can burn CPU inside its process until terminated; per-extension memory caps are not enforceable from the web platform. Mitigation is W5 termination plus a visible "extension is busy / stop" affordance in Settings. Tauri process isolation (extensions in a separate webview/process) is listed as a future hardening option, not a v2 requirement.

## 5. Network mediation

`network` is the most requested v2 feature (link checkers, asset fetchers, translation, license lookup) and the most dangerous one (every read permission becomes an exfiltration channel). Design: the sandbox never gets `fetch`; the host proxies.

- **SEC-N1 (blocking).** The manifest declares exact HTTPS origins: `network: { "origins": ["https://api.example.com"] }`. No wildcards across hosts (`https://*` is invalid); subdomain wildcards (`https://*.example.com`) are allowed but flagged in review. No IP literals, no ports other than 443, no `http:`, no localhost/private/loopback/reserved ranges (SSRF guard), no credentials in URLs.
- **SEC-N2 (blocking).** All network I/O goes through `somnia.net.request({origin, path, method, headers, body})`, executed host-side after checking the origin against the declared list. The host enforces: `credentials: 'omit'`, `redirect: 'error'`, `referrerPolicy: 'no-referrer'`, response cap 5 MB, request cap 1 MB, timeout 20 s, rate limit 30 requests/min per extension.
- **SEC-N3 (blocking).** The consent dialog shows the exact origin list and what each origin is for (author-supplied justification, required in the manifest). An update adding origins triggers the SEC-P2 diff flow.
- **SEC-N4 (blocking).** `network` combined with `project.read` (or any read permission) is the exfiltration combination: the install dialog calls this out explicitly ("can send your project content to these servers"), and catalog review treats it as Tier 3 (section 8).
- **SEC-N5.** Responses are delivered as JSON text/bytes only; no streaming handles, no raw sockets, no WebSockets in v2. A v3 WebSocket permission, if ever added, is per-origin and host-mediated the same way.
- **SEC-N6.** The sandbox CSP `connect-src` is set to exactly the declared origins as a second layer; with SEC-N2 alone the model holds, the CSP layer keeps the invariant when code reaches the network stack directly. DNS rebinding and CDN-shared origins are documented residual risks: an origin allowlist is a routing control, not a proof of who answers.

## 6. Panel and UI hardening

- **SEC-UI1 (blocking).** The v1 panel sandbox stays unchanged; it is the reference boundary. v2 additions only.
- **SEC-UI2 (blocking).** Panels must not request or render credential input (no password fields, no "paste your API key here" flows). Manifest lint rejects `type="password"` and review rejects credential-shaped forms. Panels that need a service token direct the user to Settings, which stores it host-side; the extension then holds only an opaque handle. This counters the main phishing vector: a sandboxed frame can fake any UI.
- **SEC-UI3.** Every panel and rail entry carries the extension name in host-rendered chrome (the v1 `h2` title is host-rendered; keep it host-rendered and unstyleable by the panel).
- **SEC-UI4.** Panel-to-host and host-to-panel messages use the SEC-W6 channel token. The bridge keeps posting replies to the specific `contentWindow` with source verification.
- **SEC-UI5.** `ui.notify` text is prefixed with the extension name in the status bar, so a notice can never impersonate the app ("Update available" must read "LinkCheck: Update available").

## 7. Catalog integrity

v1 pins hashes in an index on a mutable branch (F6). v2 makes the index a signed, versioned, expiring artifact.

- **SEC-C1 (blocking).** The index (`index.json`) is signed with an offline Ed25519 release key (minisign format). The public key ships pinned in the app; the app refuses an index whose signature does not verify. Two keys are pinned (current + next) to allow rotation without a flag day.
- **SEC-C2 (blocking).** The index carries `serial` (strictly increasing) and `expiresAt` (max 30 days after issue). The app refuses a serial lower than the last seen one (rollback protection) and an expired index (fail closed for updates; already-installed extensions keep running under their last consent).
- **SEC-C3 (blocking).** The app fetches the index from an immutable reference (tagged release artifact or commit-pinned raw URL), not from a moving branch head.
- **SEC-C4 (blocking).** Per-package integrity stays SHA-256 of the exact ZIP bytes, pinned in the signed index. Packages listed as third-party must additionally be reproducible: the review CI rebuilds the ZIP from the tagged source with the documented build steps and compares the hash (the current first-party deterministic-zip practice, extended to all entries).
- **SEC-C5 (blocking).** The signed index contains a revocation list (extension id + version range + reason). The app refuses installs and updates of revoked entries and shows a removal recommendation for installed ones. Revocation takes effect with the next signed index; no push channel is claimed.
- **SEC-C6.** Key management: the release key lives offline (hardware token or an air-gapped store), signing happens at release time, and the procedure (sign, verify, rotate, revoke) is documented in the catalog README. Loss of the key means publishing a new app release with new pinned keys; this is documented, not improvised.
- **SEC-C7.** Update semantics: catalog updates are never automatic. Version ordering follows the existing catalogView rules; the SEC-P2 permission-diff gate runs on every update; identical-version replacement is refused.
- **SEC-C8.** Honest scope note for docs: signatures prove the index was produced by the release key and that bytes match pins. They do not prove an extension is safe. Review (section 8) remains the safety mechanism; integrity mechanisms keep review from being bypassed.

## 8. Catalog review process

Formalizes the existing index README into tiered, enforceable rules.

- **SEC-R1 (blocking).** Risk tiers decide review depth:
  - **Tier 0** - declarative only (themes, snippets), no permissions: one reviewer, automated checks.
  - **Tier 1** - panels and/or low/medium permissions, no worker code, no network: one reviewer, full source read.
  - **Tier 2** - worker code (SEC-W1 implemented) or high permissions (`project.write`, `project.write.html`): two reviewers, full source read, reproducible build (SEC-C4).
  - **Tier 3** - `network`, `ai.query`, `git.commit`, or any read+network combination: two reviewers, reproducible build, per-origin justification checked against the declared purpose, and a staged rollout note (listed as "new" for one index cycle before updates are accepted).
- **SEC-R2 (blocking).** No obfuscation: minified/bundled code requires the exact source tree, tag and build instructions. Reviewers may reject on unreadability alone.
- **SEC-R3 (blocking).** CI gate on every catalog PR: manifest validation with the app's own parser, permission lint (unknown/overbroad scopes), network-origin lint (SEC-N1 rules), size limits, hash rebuild, signature check on the modified index. The hash is always recomputed from the downloaded bytes by CI, never accepted from the author.
- **SEC-R4 (blocking).** Every entry records: author identity (GitHub account age and history checked by a human), source repo + tag, permission justifications, reviewer names, review date. The catalog README keeps the public entry requirements (README, LICENSE, no version overwrite) and adds: a security contact and a statement that listing can be revoked.
- **SEC-R5.** Re-review: entries with Tier 2/3 permissions are re-reviewed on every version update (not only on first listing). Stale entries (no update in 18 months, or flagged by a user report) are re-checked or delisted at the next index release.
- **SEC-R6.** Reports and takedown: a documented abuse contact (GitHub issue template "Extension security report"); a verified report leads to a revocation entry (SEC-C5) in the next signed index. Target: revocation within one release cycle.
- **SEC-R7.** Reviewer rules: reviewers do not approve their own extensions; Tier 3 approvals need one reviewer with merge rights on the index; review notes are kept in the PR.
- **SEC-R8.** Honest staffing note: this process assumes at least two reachable reviewers. While the project has a single maintainer, Tier 2/3 entries stay closed ("not accepting executable/network extensions yet") rather than reviewed by one person under pressure. Saying no is a valid process outcome.

## 9. Threat model

Method follows the ADR-005 threat-model note: assets and actors from section 2, each threat mapped to controls and an honest residual risk.

### 9.1 Malicious extension in a panel

| Threat | Mitigation | Residual risk |
|---|---|---|
| Exfiltrate project content read via `project.read` | No network in the sandbox (F1, browser-enforced); no events without `events.project`; v2 glob-scoped reads | Side channels inside the app (e.g. smuggling data into `storage` values and hoping the user syncs the profile elsewhere) are conceivable but slow and visible; timing/covert channels are not eliminated and are not claimed to be |
| Phishing UI inside the panel (fake login, "enter API key") | SEC-UI2 credential ban, SEC-UI3 host chrome, SEC-UI5 prefixed notices | A determined fake can still mimic *content* ("your file has an error, click…"). User education and the extension name in chrome reduce, not remove |
| Escape the iframe sandbox | Browser-enforced sandbox + CSP; no app-origin execution | Engine 0-day: outside the model; Tauri/WebView updates are the mitigation |
| Deface the project through `project.write` | Undoable ops only, `reason` in undo history, SEC-P7 op budgets, SEC-P4 HTML sanitizing | Undo restores content but the user must notice the damage; bulk damage between saves is possible if granted full `project.write`, hence Tier 2 review and scoped writes |

### 9.2 Malicious extension in a worker (v2: sandboxed iframe context)

| Threat | Mitigation | Residual risk |
|---|---|---|
| Exfiltrate data over the network | SEC-W1/W2 CSP `connect-src`; SEC-N2 host-mediated requests only to declared origins; SEC-N4 explicit consent for read+network | Declared origins are trusted to be what they claim (CDN-shared hosts, DNS rebinding, SEC-N6 residual). An approved origin can always receive what the extension reads: review of purpose (SEC-R1 Tier 3) is the real control |
| CPU/memory denial of service | SEC-W5 activation/command timeouts with termination, SEC-W8 busy indicator | A polite infinite loop with yields can persist until timeout; memory caps unenforceable, documented |
| Persist beyond disable/remove | SEC-W5 full sandbox teardown, per-profile registry, removal deletes storage and flags | None identified in the web platform model |
| Reach app secrets or settings | F12 invariant: no API path; SEC-W1 keeps code off the app origin | A host API bug could widen the surface; API surface review is part of every SDK change (SEC-R7 process for the host too) |
| Supply-chain into exported sites (inject scripts/beacons into the user's published HTML) | SEC-P4 sanitizer + separate `project.write.html` grant, diff preview | Sanitizer bypasses are a classic cat-and-mouse; the user reviewing a diff of raw-HTML inserts is the fallback. Stated honestly in the author and user docs |

### 9.3 Distribution channel

| Threat | Mitigation | Residual risk |
|---|---|---|
| Compromised index (malicious entries or re-pointed hashes) | SEC-C1 signed index, SEC-C3 immutable fetch ref, SEC-C2 serial/expiry | Release-key compromise defeats this until rotation (SEC-C6); key is offline to make compromise unlikely |
| Malicious update to a listed extension | SEC-C7 no auto-update, SEC-P2 permission-diff re-consent, SEC-R5 re-review per version, SEC-C4 reproducible rebuild | A benign-permission update can still be malicious in behavior (e.g. corrupts text it is allowed to edit); review limits, user undo mitigates |
| Rollback to an old vulnerable index | SEC-C2 serial monotonicity | Clock manipulation on the user device weakens `expiresAt`; serial check is the primary control |
| Reviewer/maintainer account takeover merging a bad entry | Two-reviewer rule for Tier 2/3 (SEC-R1), CI gate (SEC-R3), signed index means a merged PR still needs a release signature | With a single maintainer (SEC-R8), account takeover is the weakest link; hardware-backed GitHub auth and the offline signing key are the compensating controls |
| Malicious local install (user pastes a manifest from a forum) | SEC-P2 update diff, honest install dialog, worker code from local sources runs only under the same SEC-W1 sandbox | The user can always consent to a dangerous grant; the docs must keep the v1 honesty: "only enable extensions you trust" |

### 9.4 What this model does not claim

- No protection against a compromised browser/WebView engine or OS.
- No elimination of covert timing/storage side channels between a sandbox and the host.
- No guarantee that a reviewed extension is safe; review raises the cost of malice and catches accidents, it does not prove intent.
- No real-time revocation push; revocation rides the signed index.

## 10. Migration and compatibility

- `apiVersion` becomes 2 when SEC-W1 through W7, SEC-P1 through P6 and SEC-N1 through N4 are implemented. The manifest validator accepts `apiVersion: 2` only from that release on.
- apiVersion 1 declarative extensions (themes, snippets) and panels keep working unchanged; their sandbox is the v2 boundary already.
- apiVersion 1 worker code (`code`/`main`) is grandfathered for **local installs only**, runs in the new SEC-W1 sandbox through a compatibility adapter, and stays excluded from the catalog until SEC-R1 Tier 2/3 review capacity exists (SEC-R8).
- The storage, enabled-flag and revocation registries migrate in place; the SEC-P2 diff rule applies to the first update after migration (existing installs are treated as "same permissions", so they are not disabled by the migration itself; marked as a deliberate compat trade-off, not a silent hole: any *subsequent* change triggers the diff).
- Docs: `07-security.md` is rewritten to describe v2 and keeps the honest tone; this document is referenced from ADR-003 as its security successor.

## 11. Assumptions and open questions

Marked honestly; each needs a maintainer decision or an implementation check before it becomes a requirement.

1. **Studio surface is not final.** The per-studio permissions in 3.1 assume the Affinity-style studio architecture from the product notes; the concrete studio list and their APIs are assumed, not verified against code on this branch.
2. **Tauri webview behavior** for meta-CSP inside srcdoc iframes and CSP inheritance into blob workers is specified per web platform standards, but must be verified once on the Windows, macOS and Linux webviews before SEC-W1/W2 are declared done. If a webview does not inherit CSP into blob workers, the fallback is: extension code runs only in the iframe main context (no nested worker), keeping `connect-src` enforced.
3. **Key management** assumes the maintainer can operate an offline Ed25519 key; if not, the interim is the v1 hash pinning plus SEC-C2 serial/expiry signed by a CI-held key, which is weaker, and if chosen it must be documented as interim.
4. **Review capacity** (SEC-R8) assumes the project can staff two reviewers for Tier 2/3; today it cannot. The process deliberately closes those tiers instead of pretending coverage.
5. **AI settings location**: it is assumed agent API keys live in app settings and are not reachable from the extension host API today; F12 records this as an invariant to test, and a regression test ("no extension API returns settings/secrets") should be added with the implementation.
6. **Collaboration CSP**: SEC-W7 assumes the collab relay can be served from explicit origins or a dedicated connect path; if the product requires arbitrary `wss:` targets, the exception is scoped to the collab feature's code path and documented, not re-granted app-wide.
7. **Performance cost** of one sandboxed iframe per extension is assumed acceptable for the expected extension counts (< 20 active); no measurement exists yet.

## 12. Requirement index

| ID | Requirement | Blocking for v2 |
|----|-------------|-----------------|
| SEC-P1 | Plain-language, tier-ordered consent dialog | yes |
| SEC-P2 | Permission-diff re-consent on every update, installs disabled | yes |
| SEC-P3 | Immediate per-permission revocation, incl. in-flight network | yes |
| SEC-P4 | Separate `project.write.html` grant + sanitizer | yes |
| SEC-P5 | `ai.query` provider-named consent + activity log | yes |
| SEC-P6 | Storage total quota (keys + bytes) | yes |
| SEC-P7 | API rate limits and op budgets | yes |
| SEC-P8 | Grant audit log per profile | no |
| SEC-W1 | Extension code only in opaque-origin sandboxed iframe, CSP-enforced | yes |
| SEC-W2 | Nested workers only inside the sandbox, inheriting CSP | yes |
| SEC-W3 | No eval-family execution; CSP stays free of `unsafe-eval` | yes |
| SEC-W4 | Global removal kept as defense in depth only | yes |
| SEC-W5 | Activation/command timeouts with full teardown | yes |
| SEC-W6 | Per-activation channel tokens, one sandbox per extension | yes |
| SEC-W7 | Remove blanket `ws:`/`wss:` from app `connect-src` | yes |
| SEC-W8 | Busy indicator + documented CPU/memory honesty | no |
| SEC-N1 | Declared HTTPS origins only, SSRF guard | yes |
| SEC-N2 | Host-mediated request API with caps and no credentials | yes |
| SEC-N3 | Origin justification + diff on change | yes |
| SEC-N4 | Explicit read+network exfiltration warning | yes |
| SEC-N5 | No streaming/sockets in v2 | yes |
| SEC-N6 | CSP `connect-src` mirrors declared origins; residuals documented | yes |
| SEC-UI1 | v1 panel sandbox unchanged | yes |
| SEC-UI2 | Credential-input ban in panels | yes |
| SEC-UI3 | Host-rendered extension chrome | yes |
| SEC-UI4 | Token-bound panel bridge | yes |
| SEC-UI5 | Extension-prefixed notifications | yes |
| SEC-C1 | Signed index, two pinned public keys | yes |
| SEC-C2 | Serial + expiry, rollback and stale-index refusal | yes |
| SEC-C3 | Immutable index fetch reference | yes |
| SEC-C4 | Reproducible package rebuild in review CI | yes |
| SEC-C5 | Signed revocation list | yes |
| SEC-C6 | Documented offline key procedure | yes |
| SEC-C7 | No auto-update; permission-diff gate on updates | yes |
| SEC-C8 | Honest documentation of what signatures prove | yes |
| SEC-R1 | Tiered review depth (T0-T3) | yes |
| SEC-R2 | No obfuscation; source + tag + build steps | yes |
| SEC-R3 | CI gate on catalog PRs with recomputed hashes | yes |
| SEC-R4 | Entry metadata: identity, justification, reviewers, contact | yes |
| SEC-R5 | Re-review of Tier 2/3 on every update | yes |
| SEC-R6 | Abuse report + revocation SLA | yes |
| SEC-R7 | Reviewer conflict rules | yes |
| SEC-R8 | Single-maintainer honesty: Tier 2/3 stay closed until staffed | yes |

Related documents: [Security model v1](07-security.md), [Publish to the index](13-publish-to-index.md), [catalog README](catalog/README.md), [ADR-003](../../phase1/notes/ADR-003-extension-sdk.md), [ADR-005 threat model](../../phase1/notes/ADR-005-threat-model.md).
