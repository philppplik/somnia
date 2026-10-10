# Extension Store: trust model

Status: describes the code at `origin/ext/store-ui` (99d73d5). Every statement names the file that enforces it. Anything not enforced is listed under [Known limits](#known-limits).

## What the Store is today

The Store screens read the GitHub extension index (`CATALOG_URL` in `catalog.ts`, `docs/extensions/catalog/index.json` on `phase1-foundation`). `createCatalogStoreHost()` (`storeHostDefault.ts`) adapts it to the `StoreHost` interface (`storeHost.ts`).

The index is **not signed** in this build. It is fetched over HTTPS from `raw.githubusercontent.com` with `redirect: 'error'`, `credentials: 'omit'` and a size cap (300 kB). Entries are checked by `validateCatalog`: `repo` must be a `https://github.com/<owner>/<repo>` URL, `download` must be a plain `raw.githubusercontent.com` URL, `sha256` must be 64 hex characters.

An index entry carries: id, name, version, author, description, repo, download URL, SHA-256, apiVersion, permissions, optional category. Nothing else.

## What a package install verifies

`StoreHost.stage(id, version, sha256, mode)` runs these checks in order. Each failure returns a `StageResult` error and nothing is written.

| Check | Failure code |
| --- | --- |
| Entry with this id and version exists in the fetched index | `stale` |
| SHA-256 requested by the UI equals the index entry | `mismatch` |
| Release is not on the verified blocklist | `blocked` |
| `update` mode requires the extension to be installed | `stale` |
| Package ZIP downloaded (cap 2 MB) and its SHA-256 equals the index entry | `mismatch` |
| Package parses; id, name, version, apiVersion and permissions equal the index entry | `failed` |
| Package contains no worker code (`code` or `main`) | `incompatible` |
| Manifest converts for review (`migrateLegacy`) | `incompatible` |
| Any other error | `failed` |

Source: `catalog.ts` (`reviewCatalogPackage`), `storeHostDefault.ts` (`stage`).

The SHA-256 match proves that the bytes equal what the index lists. It does not prove who wrote the index entry, and it does not prove the extension is safe.

## Evidence

`StoreHost.evidence()` returns `null` for every release (`storeHostDefault.ts`). The UI shows this as "not published". The index has no publisher domain, no 2FA declaration, no build provenance and no review result, so those fields are empty and are never filled by inference.

The `listed` release state means "present in the index". It is not a review result.

## Consent before anything is committed

`stage()` returns a bound consent candidate. The host opens the consent review (`requestConsentReview`, `consentUiHost.ts`) with three callbacks:

- `revalidate()` runs again immediately before commit. It re-checks the blocklist and downloads and verifies the package again.
- `commit(candidate, approve)` first checks that the artifact hash still equals the staged one, then runs `approve()` (the broker records consent), then writes the registry. If the registry write fails, the approval is forgotten (`broker.forget`).
- `onClose` fires when the review is dismissed. Nothing is installed.

The candidate identity covers the full manifest, both hashes, the source, the previous manifest and any blocked-previous reason (`candidateIdentity`). A change in any of them invalidates the review.

Store installs of this index are written disabled (`installReviewedPackage` calls `installExtension(..., {disabled: true})`). The user switches them on.

## Updates

Updates are found only by an explicit check (`checkUpdate`). Nothing is fetched in the background.

- No new permissions: the update installs without a prompt.
- New permissions: the update is staged and the popup shows the added permissions. The installed version keeps running until the user accepts (`acceptUpdate`). "Keep current" records the declined version in `localStorage` (`somnia.extensions.declined.v1`) and the same version is not offered again.
- A failed fetch throws, so the popup never shows "up to date" without proof.

## Blocklist

`BlocklistService` (`blocklist.ts`) consumes a signed index:

- Ed25519 signature over the exact UTF-8 payload bytes. The 32-byte public key comes from host configuration, never from the index (`ed25519IndexVerifier`).
- Rollback (lower revision) and a changed payload at the same revision are rejected. A bad signature or schema keeps the last verified policy and reports `invalid`. Network failure reports `offline` and keeps the last verified policy.
- Version ranges use a closed grammar (`*`, exact, comparators, `||`). An unsupported range rejects the whole feed instead of silently missing a block.
- Check at launch and every 24 hours (`monitorBlocklist`).
- Applies to both tiers.

Behavior on a match: **disable and notify**. The extension is disabled, its capabilities are removed and its runtime is destroyed (`PermissionBroker.setBlocked`). It is never uninstalled; files, settings, history and secrets stay. The user is notified once per `id@version:reason_url`. The user cannot re-enable a blocked extension (`E_BLOCKLISTED`). When a newer feed no longer matches, only the policy lock is cleared. The extension stays disabled until the user enables it.

Install paths also check the blocklist: `inspectCandidate` returns `blocked`, `install()` rejects `blocked`, `setEnabled(true)` throws `blocked`.

**Not active by default.** The host needs the bundled public key and the signed index URL through `DefaultHostOptions.blocklist`. With none configured, nothing is blocked.

## Restricted Mode

State lives in `somnia.extensions.security.v2` (`permissionBroker.ts`). A fresh profile starts restricted and unacknowledged. While restricted:

- extensions show as not enabled in the popup (`extensionsRestricted`, `restrictedMode.ts`);
- `openSession` throws `E_RESTRICTED_MODE`;
- active sessions are closed when restricted mode is switched on.

Missing, corrupt, oversized (over 4 MB) or unreadable consent data counts as restricted. Leaving restricted mode requires the first-run acknowledgement (`E_FIRST_RUN_CONFIRMATION_REQUIRED` otherwise). If a write to storage fails, the broker falls back to restricted.

## Known limits

- The index is unsigned and hosted on a mutable branch. A compromised repository or reviewer account can change an entry and its hash together.
- The store consent candidate is labelled `signed-match` (`asCandidate`, `popupHostDefault.ts`). It means "SHA-256 equals the index entry". It is not a signature check.
- The Store shows `badge: null` for every extension and `verified: true` in `browse()` for every index entry. There is no verified-publisher check in this build.
- `submitReport()` always rejects. The report dialog falls back to the public issue form (`publicIssueUrl`). There is no private security-report route yet.
- Catalog packages with worker code are refused (`Catalog worker code is not supported yet`). Only declarative extensions and sandboxed panels install from the Store.
- Native (Tier B) extensions cannot be installed from the Store (`E_NATIVE_STORE_FORBIDDEN`).
- The v2 `ExtensionSupervisor` does not load packages from `V2PackageStore`. Approved v2 installs are listed and can be disabled, revoked and removed, but they do not run.
- Network access by extensions (F4) is a documented, accepted risk. See [Security model v2](extensions/14-security-model-v2.md).
