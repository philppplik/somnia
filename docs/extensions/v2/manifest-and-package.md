# SDK v2 manifest and package contract

SDK v2 uses a ZIP container named `.somniax` with exactly one root
`somnia-extension.toml`. These names supersede older JSON-manifest references.
The v2 TOML keys preserve the supplied v2 schema's camelCase contract. The older
security concept's `[extension]`, native engine and expanded permission tables
are not an alternate accepted shape. Native extensions require a separate
versioned contract, not a permissive fallback in this validator.

The structural contract is bundled at
`phase1/src/lib/extensions/contracts/v2/manifest.schema.json`. It uses JSON Schema
2020-12 on the parsed TOML data model. `$schema` is an editor hint, never fetched.
The JSON example beside it is test data, not an installable manifest. An actual
TOML example is [somnia-extension.toml](./somnia-extension.toml).

## Entry points

`phase1/src/lib/extensions/manifestV2.ts` exports:

- `parseManifestV2(source, options)` for UTF-8 TOML text or bytes.
- `validateManifestV2(input, options)` for an already parsed v2 data model.
- `ManifestV2`, `ExtensionDiagnostic`, `ValidationResult`, `isSafePackagePath`
  and `isValidWhen` for other extension subsystems.

Both validators return `{ok: true, manifest}` or `{ok: false, errors}`. Successful
manifests are independent, recursively frozen snapshots. Failed packages must
not register any contributions. Error messages do not include parser excerpts,
absolute paths, stack traces or source contents.

`options.somniaVersion` and `options.apiVersion` check compatibility independently.
Install-time shape inspection may omit them. Enablement must pass **both** actual
host versions. A package's engine range is not proof that the running app supports
SDK v2. The `lane` option defaults to local: proposed APIs require `experimental`;
Store packages reject eager `*` activation. Proposal availability/opt-in checks
belong to the proposal registry and remain required after manifest validation.

`phase1/src/lib/extensions/packageV2.ts` exports `parsePackageZipV2(bytes, options)`
and `parsePackageFilesV2(files, options)`. A successful package result is
`{ok: true, package: {manifest, files}}`. The file map and every buffer are copies,
not aliases of the caller's input. Treat returned buffers as package-owned data.
A folder importer must reject symlinks and special files **before** reading bytes;
an in-memory map cannot prove what filesystem entry supplied it. ZIP preflight
checks file modes without extracting anything to disk.

## Validation rules

- Closed schema at every level, duplicate TOML keys rejected, reserved prototype
  names rejected, nesting limited to 32, UTF-8 manifest budget 256 KiB.
- Namespaced IDs, duplicate contribution IDs, publisher equality, SPDX license
  expressions or safe `SEE LICENSE IN` references.
- Pinned SemVer parser. Engine comparator sets require explicit lower bounds
  and an exclusive upper major boundary (`>=11.0.0 <12.0.0`, not `*` or tags).
  The API range must stay within major 2. Package versions are stable SemVer.
- Known permissions, limited-workspace subset checks, activation/contribution
  correspondence, declarative runtime restrictions, bounded workspace globs.
- `when` uses a small boolean grammar, no JavaScript evaluation. Command schemas
  use a closed subset with no references, patterns or arbitrary keywords.
- Safe package-relative paths: no traversal, absolute/drive/UNC paths, backslashes,
  empty segments, Windows device names, trailing dots/spaces, case/Unicode
  collisions or parent-file conflicts. Every referenced asset must exist.
- HTTPS informational links without embedded credentials.
- Dependency inventory license/exact-version/duplicate checks. The inventory does
  not by itself establish source provenance or completeness.

## Package budgets and ZIP preflight

25 MiB compressed, 100 MiB expanded, 5,000 entries, 20 MiB runtime entry,
256 KiB panel assets, 64 KiB theme assets and 32 KiB snippet assets.

Before decompression, check the end record, central/local header agreement,
names, sizes, compression, CRC metadata, overlapping regions and Unix modes.
Reject ZIP64, multi-disk archives, encryption, symlinks, special files,
executable permission bits, duplicated/colliding names, unsupported compression,
and nested archives/native binaries by filename and common signatures.
After decompression, verify actual lengths and CRC32. CRC is corruption detection,
not authentication. The installer must verify the artifact digest against its
trusted receipt before calling this parser and perform atomic installation after
all later security checks pass.

## Stable diagnostic families

Every error has `code`, `path` and `message`. `path` is an RFC 6901 JSON pointer
into the parsed manifest, or `/files/<escaped inventory path>` for package files.
An empty pointer identifies the document/archive as a whole. TOML syntax errors
cannot reliably name a parsed property and therefore use the empty pointer.

| Code | Meaning |
| --- | --- |
| `SOM-EXT-001` | TOML, UTF-8 or manifest byte budget |
| `SOM-EXT-002` | Closed structural schema, nesting or reserved property |
| `SOM-EXT-003` | Semantic contract, namespace, activation or lane policy |
| `SOM-EXT-004` | Engine range or host compatibility |
| `SOM-EXT-005` | Unsafe or colliding package path |
| `SOM-EXT-006` | Missing manifest or referenced inventory file |
| `SOM-EXT-007` | Package/asset resource budget |
| `SOM-EXT-008` | Invalid/corrupt archive, forbidden entry or binary |

No pre-existing numeric mapping was specified by the supplied security concept;
this module defines the validation family's stable mapping. Runtime error names
such as `E_PERMISSION_DENIED` remain a separate broker contract.

## Integration boundary

This branch does not enable executable packages or change the v1 registry.
Callers must not pass v2 manifests into the legacy inline-code runtime. Studio
asset formats, theme contrast, snippet grammar, declarative view actions,
Wasm imports/ABI/memory, JS import allowlists, package digest receipts and source
SBOM validation are later validators. A successful result here is the manifest
and container gate, not a runtime security certificate or permission grant.

Run focused checks:

```sh
cd phase1
npm ci
npx tsc -p tsconfig.extensions-v2.json
npx tsx --test src/lib/extensions/manifestV2.test.ts src/lib/extensions/packageV2.test.ts
```

The `Extension manifest v2` workflow also runs the unchanged legacy manifest and
package tests. Its isolated typecheck does not depend on generated studio Wasm
assets; the full application build remains a separate integration gate.
