# 11. Versioning

Two version numbers matter.

## `apiVersion` (the contract)

The extension API is versioned with a whole number. Somnia v9.5 supports `apiVersion` 1 only. A manifest with another value is rejected with a clear message, so an extension never runs against an API it was not written for.

Rules for future versions:

- Within one `apiVersion`, existing methods, fields and error semantics do not change incompatibly. New optional methods and permissions may be added.
- A breaking change gets a new `apiVersion`. Somnia may support several at once for a deprecation period, announced in the release notes.
- Permissions are never widened silently: a new permission needs a manifest change and shows up in Settings.

## `version` (your extension)

Use `x.y.z`: patch for fixes, minor for features, major when users must change something (for example a new permission). Installing the same `id` with a new `version` replaces the old manifest and keeps the user's enabled flag and revoked permissions.

If you add a permission in an update, the user sees it as a new checkbox, checked by default. Mention it in your changelog.

## Somnia releases

Somnia releases are tagged `vX.Y.Z-alpha` on GitHub. Release notes list API changes under Highlights. The current status is alpha: the API is small on purpose and may grow before a stable 1.0.

Back to the [index](README.md).
