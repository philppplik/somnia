# GitHub extension index (schema 1)

This directory is the initial reviewed index. It lives in the Somnia repository so the first version needs no separate repository. The app reads `index.json` on `phase1-foundation` only after the user chooses **Browse GitHub extensions**. Moving it to `somnia-extensions` later needs a change to `CATALOG_URL` and a review of the download hosts/CSP.

`packages/quiet-colors.json` is the readable source of the first-party, permission-free Quiet Colors theme. Its ZIP is checked into this directory and hash-pinned in the index. Do not overwrite published package versions; add a new versioned ZIP and update the entry through a reviewed PR.

## Entry format

The root is `{ "schemaVersion": 1, "extensions": [...] }`, up to 200 entries. Every entry has:

| Field | Rule |
| --- | --- |
| id, name, version | Must match the validated package manifest exactly |
| apiVersion | Currently 1 |
| author, description | Plain text, up to 80 / 400 characters |
| repo | HTTPS GitHub repository URL |
| download | Direct HTTPS raw.githubusercontent.com ZIP URL, no redirects, credentials, query or fragment |
| sha256 | 64 lowercase hexadecimal characters, hash of the exact ZIP bytes |
| permissions | The same permission set as the manifest, only known SDK permissions |

GitHub release download URLs redirect to other hosts. They are deliberately not allowed in this first implementation. Commit a versioned ZIP to the extension repository and use its raw GitHub URL. Prefer a commit SHA or immutable version tag. Mutable URLs still fail closed when the ZIP changes because its bytes must match the pinned hash.

## Review before adding an entry

1. Check the author's repository and license. Read all source, manifest contributions and any panel HTML/scripts. Explain every requested permission.
2. Refuse worker code (`code` or `main`) until the worker boundary is hardened. Sandboxed panels may be listed, but still need source review and minimal host permissions.
3. Validate the package with Somnia's actual package parser. ZIP and expanded files must stay within 2 MB and 200 files. Exactly one manifest at root or one top-level folder; no unsafe paths.
4. Compute SHA-256 from the final ZIP, compare manifest identity and permissions, add the entry and package in a PR. Never accept an author's supplied hash without checking the bytes.
5. Run `npm run test:core` in `phase1`. The first-party index/hash fixture is tested. For new entries, add the same direct package/hash test before merge.

A hash proves bytes match the index, not author identity or safety. Index review is the trust root. No paid extensions, telemetry, dependency resolution, automatic updates or automatic activation are included.

## Rebuild the first-party ZIP

From `phase1`, use fflate's `zipSync` with `somnia-extension.json` containing the readable JSON and fixed `mtime: new Date('2026-01-01T00:00:00Z')`. Compute `createHash('sha256').update(bytes).digest('hex')` with Node crypto and copy that value into the index. Tests compare the checked-in ZIP against the index. This deterministic timestamp makes rebuilds repeatable.
