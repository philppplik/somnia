# ADR-003: Extension SDK (first round)

Status: original proposal with implementation history below. Security claims are qualified by the 2026-10-09 review; the native scheme transport is proposed, not verified.

## Goals
- Third parties (and Philipp) add commands, panels, inspector sections, code snippets and themes without touching the app source.
- Local-first: extensions run offline, from a folder or a ZIP, no marketplace needed in round 1.
- Goal: host-mediated access through a small, versioned API. The current worker global removal is best effort, not a verified no-network boundary. Panels cannot access the app DOM under their opaque-origin sandbox.

## Non-goals (round 1)
- Marketplace, auto-update, paid extensions, remote code loading.
- Extensions that execute directly inside the design preview iframe. The normal design preview is script-restricted; opt-in live preview can execute project scripts, including scripts planted in source.

## Extension package
A folder or ZIP with a `somnia-extension.json` manifest:

```json
{
  "id": "acme.hello",
  "name": "Hello",
  "version": "0.1.0",
  "apiVersion": 1,
  "main": "main.js",
  "permissions": ["commands", "project.read"],
  "contributes": {
    "commands": [{"id": "acme.hello.say", "title": "Say hello", "category": "Tools"}],
    "snippets": [{"language": "html", "label": "Hero", "body": "<section class=\"hero\">$1</section>"}],
    "codeThemes": [{"id": "acme-night", "label": "Acme Night", "light": {}, "dark": {}}]
  }
}
```

Declarative contributions (commands, snippets, code themes, Insert menu items) need no code at all and are the first thing the host supports. They map onto things that already exist: the command registry (`registerCommand`), the Insert menu element list, and the `data-code-theme` syntax tokens.

## Runtime model
Extension code runs in a sandboxed Worker (a dedicated Worker created from a Blob URL, no DOM, no `window`). The host and the worker talk over `postMessage` with a small JSON-RPC style protocol:

- host to worker: `activate`, `command.run {id}`, `event {name, payload}`
- worker to host: `api.call {method, args, requestId}` and `log`

The worker never receives object references, only JSON. The host validates every call against the manifest permissions and against input schemas before acting.

## API surface (apiVersion 1, all async)
| Method | Permission | Notes |
| --- | --- | --- |
| `commands.register(id, handler)` | `commands` | Id must be declared in the manifest. Shows in menus and the palette. |
| `project.listFiles()` / `project.readFile(path)` | `project.read` | Reads from the in-memory editor core, not from disk. |
| `editor.applyOperations(ops)` | `project.write` | Same operation types as the UI (setText, setStyle, insert, delete). One core transaction, undoable, never writes to disk directly. |
| `selection.get()` | `selection` | Node id, tag, attrs. |
| `ui.notify(text)` | `ui.notify` | Status bar notice. |
| `storage.get/set(key)` | `storage` | Per-extension key/value, size-capped, stored in the app profile. |

Saving to disk stays with the app's save pipeline (journal, revision check, verify). Extensions cannot bypass it.

## Permissions and trust
- The user sees the permission list at install and can revoke it later in Settings.
- No network permission in round 1. Declarative code themes and snippets carry no code.
- Extensions are installed per profile (IndexedDB in the browser, app data folder on desktop). Disabled by default until the user enables them.
- Malformed manifests, unknown permissions or an `apiVersion` the host does not know are rejected with a visible message.

## Versioning
`apiVersion` is an integer. Adding methods is compatible; changing or removing one bumps it. The host can support several versions at once for one release cycle.

## Plan
1. This ADR plus the TypeScript types in `src/lib/extensions/types.ts` (manifest, permissions, API method signatures).
2. Manifest validator and declarative host: commands, snippets, code themes, Insert items. Unit tests for validation. Extensions panel in Settings (list, enable, remove, permissions).
3. Worker runtime with `commands.register`, `project.read`, `selection.get`, `ui.notify`. Playwright test with a fixture extension.
4. `editor.applyOperations` and `storage`. Docs and a sample extension in `phase1/examples/`.
5. Desktop: load from an app data folder. Web: load from a picked folder or ZIP.

## Decisions by Philipp (2026-10-04)
- Panels are in round 1: extensions may add sidebar and inspector panels.
- Distribution later goes through a GitHub-hosted index (see below). Local installs stay supported.

## Panels
Manifest `contributes.panels: [{id, title, side: left|right, html}]` (html up to 50 kB). The host shows one puzzle icon per panel in the matching icon rail. A panel replaces the sidebar or inspector body while active and runs in `<iframe sandbox="allow-scripts">` with an opaque origin and a CSP of `default-src 'none'` (restrictive fetch policy, inline script and style only, data: images and fonts). The page gets `window.somnia` with `project.listFiles/readFile`, `selection.get`, `storage.get/set` and `ui.notify`; calls go over postMessage to the host and pass the same permission check as worker calls. This restricts resource fetches, not all navigation. The app frame policy also restricts destinations; neither fact establishes a total no-network guarantee. Frame navigation and bridge lifetime need the review below.

## Distribution (GitHub index, planned)
A public repo `somnia-extensions` holds `index.json` (id, name, version, author, repo URL, sha256 of the release zip, permissions). The app fetches the index and the zip only when the user opens the browser view, checks the hash, runs the same manifest validator and shows permissions before install. Everything stays opt-in per extension. Prerequisites before this ships: the app CSP (`connect-src` limited to the index host), a review rule for index entries, and signed or hash-pinned releases. Not built yet.

## Progress
- Step 1 done: `src/lib/extensions/types.ts` (apiVersion 1 contract) and `manifest.ts` validator (unknown permissions, foreign command ids, non-color theme values, path escapes rejected), unit tests in `manifest.test.ts`.
- Step 2 partly done: local registry (`registry.ts`, localStorage) and Settings > Extensions (paste manifest, install, remove; Playwright `extensions.spec.ts`). Contributions are validated and stored but not yet wired into the command palette, Insert menu or code themes.
- Step 2 host: `host.ts` registers manifest commands (no handler yet, shows a notice) and snippets (HTML into the selected container, CSS/JS to clipboard) as palette commands; re-activates on install or remove. Extension code themes are still open.
- Step 2 themes: extension code themes (validated hex colors only) are injected as scoped CSS rules and listed in Settings > Code editor as "(extension)". Removing the extension drops the rules; the app then shows the default colors.
- Step 3 done (local branch, not pushed): `api.ts` (permission-gated host API: commands.register, project.listFiles/readFile, selection.get, ui.notify), `workerSource.ts` (bootstrap), `runtime.ts` (one Blob-URL Worker per extension, JSON over postMessage, 5 s command timeout, terminated on removal). Manifests may carry a `code` string (max 100 kB) that runs as an async function with the single `somnia` object. Tests: `api.test.ts`, Playwright "extension code runs in a worker".
  - Hardening caveat: the worker has no DOM and fetch, XMLHttpRequest, WebSocket, IndexedDB, nested Workers and importScripts are removed before extension code runs. This is best-effort. Extension code can still reach other worker globals, so the worker needs its own enforcing response CSP and a review step before worker distribution. The app itself legitimately uses network services; setting its entire connect policy to none is not the solution. Until then extensions are for the user's own code only.
  - Not yet: `editor.applyOperations` (project.write) and `storage`; events host to worker; enable/disable and permission list UI.
- Step 3b (local): `storage.get/set` added (permission `storage`, keys up to 100 chars, values up to 20000 chars, stored per extension id in localStorage by the host).
- Panels (done, local): validator, host state, rail buttons, sandboxed iframe with bridge, tests in manifest.test.ts and extensions.spec.ts.
- Enable/disable (local): installed extensions are off until the user ticks "On" in Settings > Extensions; the list shows each extension's declared permissions. Removing an extension also clears its enabled flag. Revoking single permissions is still open.

## Progress: write API, revoke, examples (2026-10-04)
- `editor.applyOperations(ops)` (permission `project.write`): 1-50 operations, types limited to formatText, setText, setAttribute, setStyle, insertHTML, remove, move on files of the open project. `replaceSource` is not allowed. One undoable core transaction, no disk write.
- Settings > Extensions shows every declared permission as a checkbox; unchecking revokes it (stored in `somnia.extensions.revoked.v1`) and the next call fails with a clear message.
- Settings > Extensions > "Add from a .json file" installs a manifest from a file. ZIP/folder install is still open.
- Examples in `phase1/examples/`: word-count and safe-links (see README there).

## GitHub index implementation (2026-10-05)

Opt-in catalog browser, hash-pinned ZIP verification, permission review and explicit installation are implemented in `catalog.ts` / `ExtensionCatalog.tsx`. Initial index lives in `docs/extensions/catalog` in the existing repository, not a separate repo. New and replacement catalog installs stay off. Download hosts/CSP allow only raw.githubusercontent.com in addition to existing app hosts. Worker-code packages remain blocked because their network boundary is not hardened; declarative themes/snippets and sandboxed panels are supported. Index entries require source/package review in a PR. See [implementation and Windows checks](EXTENSION-INDEX.md). This supersedes the "not built yet" distribution status above without claiming the worker security prerequisite is complete.

## Native CSP repair review (2026-10-09)

The proposed `somnia-ext://` transport serves worker entry scripts and panel documents with separate host-owned enforcing CSP response headers. Keep the production app script policy free of JavaScript `unsafe-eval` and `unsafe-inline`; any narrowly scoped worker/frame load allowance is an explicit policy change, not an unchanged CSP.

See [security review](EXTENSION-NATIVE-CSP-SECURITY-REVIEW.md) for baseline file evidence, origin/credential/storage analysis, exact header recommendations, worker same-origin startup gate, navigation/bridge lifetime and native IPC tests. The scheme is not a release approval. It does not fix broad app `ws:/wss:` allowances, local replacement permission carry-over or persistent `insertHTML` output risks. Preserve catalog worker rejection. A transport-only repair retains apiVersion 1; runtime security capability checks must fail closed and cannot be bypassed by a manifest version.
