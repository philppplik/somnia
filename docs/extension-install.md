# Installing an extension

Status: describes the code at `origin/ext/store-ui` (99d73d5). Source: `popupHostDefault.ts`, `candidateInspect.ts`, `permissionBroker.ts`.

Open Extensions in the left sidebar. There are three ways to install.

| Path | Where | Lane |
| --- | --- | --- |
| Store | Store tab, pick an extension | legacy v1 package from the GitHub index |
| File or folder | Add tab, pick `.somniax`, `.zip` or a folder | v2 or legacy v1 |
| Paste | Add tab, paste the manifest text | v2 or legacy v1 |

Every install shows a review before anything is stored. Closing the review installs nothing.

## Store

See [Extension Store: trust model](extensions-store.md) for the checks. After the review the extension is installed **disabled**. Switch it on in the Installed tab.

## File, folder, paste

`inspect()` runs `inspectCandidate()` and reports one result. Nothing is stored at this point.

| Input | Lane | Verification |
| --- | --- | --- |
| `.somniax`, or `.zip` containing `somnia-extension.toml` | v2 | `parsePackageZipV2`: size limits, paths, magic bytes, CRC |
| Folder containing `somnia-extension.toml` | v2 | `parsePackageFilesV2` |
| Pasted TOML | v2 | valid only if it references no files |
| `.zip`, folder or pasted JSON (`somnia-extension.json`) | legacy v1 | `validateManifest` |

A file named `.somniax` must be a valid v2 package. Other file types are rejected as `wrongType`. A pasted v2 manifest cannot carry files, so it cannot declare an entry file.

Errors shown by the Add tab include: `malformed`, `unknownPermission`, `unsupportedApp`, `missingEntry`, `wrongType`, `duplicate` (same id and version already installed) and `blocked` (release is on the verified blocklist).

Every file, folder and paste candidate has verification `no-signed-match`. The review says so. It means the package has no signature to match.

## What happens on Install

**v2 package**

1. The consent review opens (source `manual`).
2. On confirm, the host re-checks the blocklist and that the staged bytes and manifest are unchanged (`changed` otherwise).
3. The verified bytes are stored in `V2PackageStore`.
4. `PermissionBroker.approve` records the consent. If it fails, the stored bytes are removed again. Nothing half-installed stays.

**Legacy v1 package**: installed disabled through the existing registry, with no consent review.

## Consent tiers

The tier comes from the manifest `security.tier` (`securityPolicy.ts`). The default is A.

| Tier | Meaning | What the user does |
| --- | --- | --- |
| A (sandboxed) | Runs in the sandbox with declared permissions only | Review the permissions and confirm |
| B (native) | Runs outside the sandbox | Developer mode must be on, then **hold the confirm button for 3 seconds** (`NATIVE_HOLD_MS = 3000`) |

Rules enforced in `PermissionBroker.approve`:

- Tier B needs developer mode (`E_DEVELOPER_MODE_REQUIRED`).
- The hold is bound to the exact manifest. A hold shorter than 3 seconds, or a manifest that changed during the hold, fails with `E_NATIVE_HOLD_REQUIRED`.
- Tier B can only be approved from a manual install. A store source fails with `E_NATIVE_STORE_FORBIDDEN`.
- A blocked extension cannot be approved (`E_BLOCKLISTED`).
- Turning developer mode off closes running Tier B sessions.
- A Tier B extension in an untrusted workspace does not start (`E_WORKSPACE_UNTRUSTED`).

An update that adds permissions, changes the runtime, raises the tier to B or widens file scope needs a new review (`permissionExpansion`). Tier B always needs one. The old version keeps running until the user approves.

## Restricted Mode

Restricted Mode is on in a fresh profile. Installed extensions do not run until the user leaves it, which requires the first-run acknowledgement. See [trust model](extensions-store.md#restricted-mode).

## Blocked extensions

If the verified blocklist matches an installed release, the extension is disabled and the user is notified. It is not removed and its data is kept. It cannot be switched on again until a newer blocklist no longer matches. See [trust model](extensions-store.md#blocklist).

## Managing installed extensions

- Disable, enable: popup toggle. Disable all: one action for both lanes.
- Revoke a permission: grant toggles. Revoking a folder or clipboard grant removes the stored scope.
- Remove: deletes the extension and its consent record. "Delete data" also removes its `localStorage` keys.

## Known issues

- Approved v2 installs are listed but **do not run**: the v2 `ExtensionSupervisor` does not load packages from `V2PackageStore` yet.
- Blocklist enforcement needs the bundled public key and signed index URL in `DefaultHostOptions.blocklist`. Until configured, nothing is blocked.
- `submitReport()` rejects. The concern dialog opens the public GitHub issue form instead. Do not put sensitive details in it.
- Legacy v1 installs from file or paste skip the consent review and are installed disabled.
