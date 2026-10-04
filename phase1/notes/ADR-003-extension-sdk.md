# ADR-003: Extension SDK (first round)

Status: proposed. Requested by Philipp (Oct 3, 2026: "SDK für extensions"). No code ships with this document except the contract types planned below.

## Goals
- Third parties (and Philipp) add commands, panels, inspector sections, code snippets and themes without touching the app source.
- Local-first: extensions run offline, from a folder or a ZIP, no marketplace needed in round 1.
- Safe by default: an extension never gets raw filesystem, network or DOM access. It asks the host through a small, versioned API, and the host enforces permissions.

## Non-goals (round 1)
- Marketplace, auto-update, paid extensions, remote code loading.
- Extensions that execute inside the design preview iframe (the preview stays script-free, see the canvas sandbox rules).

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

## Open questions for Philipp
- Should extensions be allowed to add whole inspector or sidebar panels (needs a UI contract, round 2), or is "commands, snippets, themes" enough for the first release?
- Distribution later: GitHub-hosted index, or only local installs?

## Progress
- Step 1 done: `src/lib/extensions/types.ts` (apiVersion 1 contract) and `manifest.ts` validator (unknown permissions, foreign command ids, non-color theme values, path escapes rejected), unit tests in `manifest.test.ts`.
- Step 2 partly done: local registry (`registry.ts`, localStorage) and Settings > Extensions (paste manifest, install, remove; Playwright `extensions.spec.ts`). Contributions are validated and stored but not yet wired into the command palette, Insert menu or code themes.
- Step 2 host: `host.ts` registers manifest commands (no handler yet, shows a notice) and snippets (HTML into the selected container, CSS/JS to clipboard) as palette commands; re-activates on install or remove. Extension code themes are still open.
- Step 2 themes: extension code themes (validated hex colors only) are injected as scoped CSS rules and listed in Settings > Code editor as "(extension)". Removing the extension drops the rules; the app then shows the default colors.
- Step 3 done (local branch, not pushed): `api.ts` (permission-gated host API: commands.register, project.listFiles/readFile, selection.get, ui.notify), `workerSource.ts` (bootstrap), `runtime.ts` (one Blob-URL Worker per extension, JSON over postMessage, 5 s command timeout, terminated on removal). Manifests may carry a `code` string (max 100 kB) that runs as an async function with the single `somnia` object. Tests: `api.test.ts`, Playwright "extension code runs in a worker".
  - Hardening caveat: the worker has no DOM and fetch, XMLHttpRequest, WebSocket, IndexedDB, nested Workers and importScripts are removed before extension code runs. This is best-effort. Extension code can still reach other worker globals, so the real boundary needs a CSP with `connect-src 'none'` for the app and a review step before any distribution. Until then extensions are for the user's own code only.
  - Not yet: `editor.applyOperations` (project.write) and `storage`; events host to worker; enable/disable and permission list UI.
- Step 3b (local): `storage.get/set` added (permission `storage`, keys up to 100 chars, values up to 20000 chars, stored per extension id in localStorage by the host).
- Enable/disable (local): installed extensions are off until the user ticks "On" in Settings > Extensions; the list shows each extension's declared permissions. Removing an extension also clears its enabled flag. Revoking single permissions is still open.
