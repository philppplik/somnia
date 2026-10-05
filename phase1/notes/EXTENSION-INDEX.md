# GitHub catalog implementation

Base: phase1-foundation v9.18.0 (`8fb685e`). Feature: `feature/extension-index`.

## Data flow

Settings > Extensions mounts a small catalog component, but sends no catalog requests on mount/startup. Browse or Refresh loads the reviewed JSON index over unauthenticated fetch. Choosing Review downloads one ZIP, verifies SHA-256 before parsing, validates the manifest, checks identity/version/API/permissions against the index and opens a permission review. Confirm install writes the existing profile registry. Cancellation never writes. New and replacement catalog installs are off before the registry change event; the user enables them using the existing list. Local JSON/folder/ZIP installs retain their existing behavior.

`catalog.ts` owns schema, URL rules, bounded downloads and hash/identity checks. `packageInstall.ts` now exposes pure parsers, rejecting ambiguous manifests and unsafe paths, and checks expanded ZIP sizes through fflate's filter before allocation. The local ZIP installer also uses this bounded parser. Catalog errors are visible and preserve local installation controls. Fetches abort after 20 seconds and on component unmount/close. No background requests or scheduled checks.

## Security limits

The GitHub index is reviewed data, never executable instructions. Its URLs are limited to raw.githubusercontent.com (HTTPS only, no redirects/credentials/query/fragment); repository links allow only github.com repository paths. Index size 300 KB; download and expanded ZIP size 2 MB; 200 entries/files. Tauri connect-src gains only raw.githubusercontent.com, not arbitrary hosts. Panel iframes keep their own no-network CSP.

The current worker bootstrap removes globals but is not a proven network boundary. Therefore catalog packages with worker `code` or `main` are refused. Sandboxed panels and declarative themes/snippets can install. Local worker installs remain supported for the user's own trusted code as before. Do not advertise general third-party executable-extension safety. CSP does not magically fix an untrusted-worker boundary and adding raw GitHub to connect-src must not be described that way.

There is no signature infrastructure: hashes are pinned in the reviewed index. A compromised index could point to harmful packages. Human PR/source review and minimal permissions remain necessary. Removal/revocation use existing Settings controls. Storage remains localStorage, not a new native data-folder installer. No auto-update/version ordering/paid extensions.

## Integration and validation

Shared edits: one import/component insertion in Settings, a backward-compatible `disabled` install option in registry, pure package parser extraction/hardening, one host added to production/dev CSP. No release/version change, dependencies, push or merge.

Checks: typecheck, production build, editor-core/lib/extension tests, catalog and existing extension Playwright tests. Browser E2E intercepts catalog requests because the files do not exist on the live branch until this feature is integrated. Windows native fetch/CSP remains for Philipp to test after merge.

## Windows checks after integration

1. Open Settings > Extensions. Nothing contacts the catalog yet. Choose Browse GitHub extensions. Quiet Colors should appear.
2. Review Quiet Colors. It must show version 1.0.0, SHA-256 verified and no host permissions. Cancel: nothing appears installed.
3. Review again and Confirm install. It appears in the installed list with On unchecked. Enable it. Settings > Code editor > Syntax theme offers Quiet Colors (extension).
4. Reinstall it from the catalog while enabled. It must switch off again. Remove it and check the theme disappears.
5. Disconnect the network and Refresh. An error should appear, with local JSON/ZIP/folder controls still usable. Reconnect and retry.
6. Check narrow window/high contrast/dark theme, keyboard tab order and scrolling. No catalog controls should enter the main editor screen.
