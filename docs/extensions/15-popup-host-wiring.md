# Popup host wiring

How the Extensions popup talks to the product. Source: `phase1/src/lib/extensions/popupHostDefault.ts`.

## Store

`createCatalogStoreHost()` (`storeHostDefault.ts`) adapts the shipping GitHub index (`fetchCatalog`) to the `StoreHost` the Store screens expect.

- The index lists id, version, SHA-256, permissions and author only. Fields it cannot prove stay empty: no publisher domain (no verified check), no 2FA declaration, no provenance, no gate evidence. `evidence()` always returns `null`, which the UI shows as "not published".
- `stage()` downloads and verifies the package with `reviewCatalogPackage` (hash and identity must match the index), converts it for review with `migrateLegacy`, and returns a bound consent candidate. Errors map to `blocked`, `stale`, `incompatible`, `mismatch`, `failed`.
- `commit()` runs the broker approval first, then writes the registry. If the registry write fails the approval is forgotten again.
- `submitReport()` rejects: there is no private security-report route yet, so the dialog falls back to the public issue form.
- Releases listed from this index carry state `listed` only so the Store can show them. This is not a Store review result.

## Add view

`inspect()` accepts pasted text, a picked `.somniax`/`.zip` (bytes) or a picked folder (files) and runs `inspectCandidate()`:

| Input | Lane | Verification |
| --- | --- | --- |
| `.somniax`, `.zip` with `somnia-extension.toml` | v2 | `parsePackageZipV2` (limits, paths, magic bytes, CRC) |
| folder with `somnia-extension.toml` | v2 | `parsePackageFilesV2` |
| pasted TOML | v2 | only valid if it references no files |
| `.zip`, folder or pasted JSON | legacy v1 | `validateManifest` |

Every candidate is `no-signed-match`. Duplicates (same id and version) and blocklisted releases are errors.

`install()`:

- v2: opens the consent review (`requestConsentReview`, source `manual`). The commit stores the verified bytes in `V2PackageStore`, then calls `PermissionBroker.approve`. Tier B (native) needs developer mode and the 3-second hold; restricted mode stays as the broker has it. A failed approval removes the bytes.
- legacy v1: installed disabled through the existing registry, as before.
- closing the review rejects with `cancelled`, which the UI ignores.

## Not wired yet

- The v2 `ExtensionSupervisor` does not load packages from `V2PackageStore` yet. Approved v2 installs are listed, can be disabled, revoked and removed, but do not run.
- `BlocklistService` needs the bundled Ed25519 public key and the signed index URL. The host takes it through `DefaultHostOptions.blocklist`; with none configured nothing is blocked.
