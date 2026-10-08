# RFC: Somnia project container (.som)

Date: 2026-10-08
Status: draft, not implemented
Base reviewed: `5c1199c931ff46537a16b50d066f327ebbe30c15`
Scope: open, local-first persistence across the Somnia studios

Related: [Architecture](../ARCHITECTURE.md), [Image editor core](../IMAGE-EDITOR-CORE-HANDOVER.md), [Vector core](../VECTORCORE.md), [Vector scene adapter](../VECTOR-FLAT-SCENE-ADAPTER.md), [Web/local bridge](../../phase1/notes/ADR-002-web-local-bridge.md).

MUST, SHOULD and MAY below define proposed conformance, not shipped behaviour.
This RFC does not claim existing format support, complete studio models or
lossless import of third-party documents.

## 1. Decision and boundaries

Use ZIP with UTF-8 JSON and ordinary assets for editable Somnia project state.
`.som` is a working extension. An unpacked folder carries the same logical
payload and is a first-class equivalent, not a reduced export.

Keep original sources, operation stacks, layers/masks, vector scenes, layout
pages, timeline references, studio links and export recipes. Each studio owns
its versioned model. Do not force every editor into one flattened canvas schema.

**A project is not a delivery format.** PNG/JPEG/WebP, SVG, HTML/CSS, PDF, WAV,
MP4 and appropriate standards remain delivery/interchange formats. Saving `.som`
MUST NOT replace a source PNG, MP4, PDF or imported native file. Simple HTML,
SVG, Markdown and images MAY remain ordinary standalone files.

Goals: durable editing intent, portable bundles, offline inspection, explicit
losses, safe saving, migrations and useful Git diffs. Non-goals: new codecs,
perfect Adobe/Affinity/Office round-trip, executable plugins/macros, credentials,
full AI chats, automatic cloud access or permanent undo/collaboration history.

## 2. Naming and registration

A brief check on 2026-10-08 found existing `.som` uses. Webopedia lists Paradox
sort information and Quattro Pro network serial numbers; fileextension.info
also lists Corel Paradox sort information [1, 2]. These are secondary catalogues,
not exhaustive registries or legal clearance. The extension is ambiguous.
Consider `.somnia` before release, but this RFC has not cleared that alternative.

`application/vnd.somnia.project+zip` is the proposed media type, not a verified
registered assignment. No registration was submitted here. The IANA vendor-tree
process in RFC 6838 and its application form are the relevant route [3, 4].
The registry was consulted, but the retrieved view was incomplete; absence from
that view cannot establish availability [5]. A release needs a fresh exact lookup.

Media type registration can record an extension; it does not grant exclusive
ownership of that extension or install an OS association. Windows associations,
macOS document types and Linux MIME/desktop integration need separate work.
Installers MUST NOT silently take over existing defaults. Detection uses package
structure and `mimetype`, not the filename alone. Until registered, downloads
SHOULD use `application/zip`, not imply an approved vendor media type. The marker
below is a proposed internal format identifier independent of registration.

Open decisions: final extension, MIME change controller/submission, OS IDs,
association UX and brand/legal review. Extension renaming is not schema migration.

## 3. Physical representations

### 3.1 ZIP package

```text
mimetype
manifest.json
documents/<document-id>/<document-sha256>.json
assets/<asset-sha256>.<extension>
previews/<preview-sha256>.png
profiles/<profile-sha256>.icc
extensions/<namespace>/<payload-sha256>.<extension>
```

IDs are project-scoped lowercase UUIDs. SHA-256 names are 64 lowercase hex
characters. Extensions are allowlisted lowercase ASCII hints, not trusted types.
Every payload except the two root files is indexed in the manifest. Directory
entries are optional. Unindexed files MUST NOT execute, acquire document meaning
or be silently copied into a new project; recovery tools may quarantine them
with a report. Meaningful future data must be indexed, not hidden in ZIP extras.

- `mimetype` is the first local file entry, Stored, no extra field. Contents are
  exactly ASCII `application/vnd.somnia.project+zip`, without a newline.
- Other files use Stored or Deflate only. Compressed media SHOULD use Stored.
  ZIP64 is allowed for large projects; unsupported ZIP64 is a reader limit,
  not grounds to label a sound file corrupt.
- No encryption, split archives, symlinks, device files or executable attributes.
- Exactly one root `manifest.json`; paths use `/` only.
- Reject absolute paths, drive prefixes, NULs, empty segments, `.`/`..`, platform
  reserved names, duplicate entries and case/Unicode-normalization collisions.
  Do not percent-decode names into different filesystem paths.
- Validate ZIP CRCs and SHA-256 over exact uncompressed payload bytes.

Hashes prove consistency with a recorded digest, not authenticity. The root
manifest, previews and every other entry remain untrusted.

### 3.2 Equal working folder

The folder has the same root files and payload paths. Pack/unpack preserves
referenced payload bytes; ZIP headers and compression are not document identity.
Content-addressed document revisions allow one manifest replacement to commit
multiple document edits. The manifest selects exactly one active revision per
stable document ID. Old unreferenced revisions are not current state.

Folder-only operational state:

```text
.som-work/lock.json
.som-work/recovery/<generation-id>/manifest.json
.som-work/journal/<segment-id>.jsonl
.som-work/cache/
.som-work/local-links.json
```

`.som-work/` MUST NOT be packed. It holds locks, recovery roots, uncommitted
journals, disposable caches and local filesystem grants, not another canonical
model. Unpack into staging/a new folder; never merge into existing work blindly.

Git tracks canonical JSON/assets, ignores `.som-work/` and temporary files.
Large media MAY use Git LFS by explicit choice. Missing LFS objects are missing
assets. Thin projects need accompanying media or an agreed external workflow.
Git history is not a backup policy. Packing takes a validated snapshot, not an
uncoordinated recursive copy during a folder transaction or Git checkout.

## 4. JSON, versions and read-only gates

Structural JSON is UTF-8 without BOM, duplicate keys, invalid Unicode or
non-finite numbers. Enforce depth/string/object/byte budgets. Load schemas from
bundled resources only; no remote `$ref` fetch when opening. IDs/strings are not
paths or code. Property handling must not enable prototype pollution.

| Field | Contract |
| --- | --- |
| `formatVersion` | Container/manifest `{major, minor}` |
| `minimumReaderVersion` | Minimum reader contract, not app release |
| Document `schemaVersion` | Independent studio `{major, minor}` |
| Operation `version` | Positive integer for exact semantics |
| Engine `algorithmVersion` | Exact evaluation semantics, opaque string |
| `appVersion` | Informational writer build, never compatibility authority |

v1 is `{ "major": 1, "minor": 0 }`. Major changes may alter meaning/remove
requirements; minor changes add safely preservable optional data. A new feature
that changes output/edit semantics MUST also be required. `minimumReaderVersion`
matches the format major and cannot exceed the format version.

Required features are stable namespaced tokens with exact integer versions,
e.g. `org.somnia.raster.layers@1`. Published definitions cover validation,
dependencies, editing/render/export rules. Declare the transitive dependency
closure. Never lower versions/remove requirements to evade a compatibility gate.

Unknown optional JSON values and indexed opaque binary payloads survive ordinary
saves. A writer unable to preserve them MUST refuse saving. Removing them is a
reviewed lossy conversion to a new destination with a loss report.

| Condition | Outcome |
| --- | --- |
| Supported container/models/features; valid state | Editable |
| Newer minor/minimum reader, unknown model major, required feature or operation semantics | Whole project read-only in v1 |
| Unknown container major, safe ZIP and recognizable marker | Quarantined inspection/extraction only; no guessed manifest schema |
| Corrupt authoritative JSON/hash/graph | Recovery inspection only |
| Missing linked media | Explicit degraded state; only independent edits allowed |
| Unsupported optional non-semantic data, preserved losslessly | Editable with disclosed limitation |

Read-only forbids overwrite, autosave mutation, in-place migration and semantic
export pretending to match unknown state. Bounded previews, safe inspection and
exact-byte copies remain possible. For unknown majors, separately decoded
previews are not proof of compatibility. A damaged optional preview may be
regenerated; it does not corrupt otherwise sound authoritative state.

Unknown disabled operations still gate writing in v1. This is deliberately
stricter than some existing runtime handlers. Missing fonts/profiles/codecs block
dependent fidelity-sensitive rendering/export rather than silently substitute.
Per-document write isolation is deferred.

## 5. Manifest and asset references

Required fields: `format`, `formatVersion`, `minimumReaderVersion`, `projectId`,
`generationId`, `appVersion`, `requiredFeatures`, `documents`, `assets`, `entries`,
`links`, `previews`, `extensions`. Unused collections are empty arrays.

`format` is exactly `somnia-project`. `entries` inventories every payload except
`mimetype` and `manifest.json`: `path`, `sha256`, `byteLength`, `mediaType`.
Digests cover stored uncompressed bytes, not parsed JSON. Verify media types
independently. Document entries contain `id`, `studio`, `schemaVersion`, `path`
and `requiredFeatures`. All references must resolve uniquely within their scope.

Illustrative empty project (not an implemented JSON Schema):

```json
{
  "format": "somnia-project",
  "formatVersion": {"major": 1, "minor": 0},
  "minimumReaderVersion": {"major": 1, "minor": 0},
  "projectId": "11a0b312-7f40-4db2-8e71-c96f38ee120a",
  "generationId": "c44c1452-8355-4890-9cf3-9f94d7b3a8d1",
  "appVersion": "example-writer-build",
  "requiredFeatures": [],
  "documents": [],
  "assets": [],
  "entries": [],
  "links": [],
  "previews": [],
  "extensions": []
}
```

Publish Draft 2020-12 JSON Schemas, feature contracts and complete fixtures with
the first implementation. Schema checks do not establish hash integrity, safe
asset parsing, graph validity or fidelity.

### 5.1 Originals, assets and derived data

Assets have stable `id`, display `name`, `role` (`original`, `derived`, `proxy`,
`renderSnapshot`, `font`), `mediaType`, `sha256`, `byteLength` and `storage`:

- Embedded: `{ "kind": "embedded", "path": "assets/<digest>.<ext>" }`.
- Linked: `{ "kind": "linked", "rootId": "<uuid>", "relativePath": "media/clip.mp4" }`.

Linked roots require a user-granted local capability. The project cannot grant
itself access. Relative paths follow package segment rules. Resolve through the
FilePort/platform boundary with symlink/junction/TOCTOU protection, never string
concatenation. Absolute paths, file URLs and network/home locations stay in local
link state, not portable JSON. v1 does not automatically fetch remote assets.

Original bytes are immutable, separately addressable and never overwritten by
import/save. Deduplicate embedded bytes by hash, not filename or visual identity.
A hash does not confer embedding rights. Derived assets have their own IDs plus
`derivedFromAssetIds`, recipe identity and algorithm version. Replacing changed
source bytes creates a new asset ID and updates only user-chosen dependencies.

Import provenance records original asset ID, adapter/version, original format,
capability (`preview`, `partial`, `editableSubset`) and machine-readable losses:
preserved, translated, unsupported, discarded features and affected object IDs.
Opaque data retention does not guarantee round-trip after dependent edits.

Linked assets have expected hash/length, or explicit `unresolved` status without
invented digests. Unresolved media limits dependent export/editing. Before sharing,
show missing links, embedding restrictions and the originals/metadata being packed.

### 5.2 Relinking

1. Show missing/changed assets and dependent documents.
2. Search only approved roots. Filename/size similarity proposes candidates.
3. Validate actual format, hash and length with bounded reads.
4. An exact hash match restores the same ID.
5. A different hash needs explicit replace/reimport confirmation, a new asset ID
   and dependency/loss review. It is not an exact relink.
6. Keep fonts, ICC profiles and proxies distinct. A proxy never silently replaces
   an original in final export.

Never substitute blank pixels, zero-length clips or fonts without diagnostics and
export gates. Local root mappings remain outside the portable payload.

## 6. Non-destructive studio state

Document envelopes contain `id`, `studio`, `schemaVersion`, `requiredFeatures`,
`coordinateSpace`, `state`, `operations`, `snapshots`, `provenance` and optional
namespaced `extensions`. Stable object IDs survive reordering/save/reopen. Do not
serialize DOM/GPU handles, blob URLs, callbacks or executable shader source.

Coordinates declare units, axes, origin and dimensions; studio schemas specify
conversions/bounds. Colors declare space, channel encoding and alpha mode, with
indexed ICC profiles. No silent CMYK/sRGB or alpha-mode conversion. Fonts retain
identity/style and permitted embedding/reference state. Substitution is not fidelity.

### 6.1 Operation stacks and snapshots

Keep existing `id`, `type`, `version`, `enabled`, `params`; the persisted descriptor
also binds a target, engine version, input assets and seed when randomness is used:

```json
{
  "id": "a0f54dd3-7367-46c1-a66e-8d9cc8aad39a",
  "targetId": "bc223fab-b832-4ee6-b0fc-4b1de0400f84",
  "type": "raster.adjust",
  "version": 1,
  "enabled": true,
  "params": {"brightness": 0.1, "contrast": 0},
  "engine": {"id": "org.somnia.raster", "algorithmVersion": "1"},
  "inputAssetIds": [],
  "seed": "0"
}
```

This proposes a descriptor, not a registered handler. Validate params, IDs and
asset dependencies. Seeds are decimal integer strings. Replay never generates
new IDs. Preserve order, disabled ops, masks and selection targets. New engines
cannot reinterpret old operation versions. Unknown intent may show opaque data
and a labeled snapshot, never silently omit or destructively bake it.

Canonical semantic state and explicit evaluation baselines are authoritative,
not an unbounded journal. Snapshots identify their asset, `documentStateHash`,
engine versions and exact operation prefix. Use only compatible snapshots for
evaluation; stale snapshots are labeled fallbacks, not current output. Renderer
changes need compatible pinned algorithms or reviewed migration/visual comparison.
Local undo may be retained, but committed work must reopen without that journal.

### 6.2 Raster layers and masks

Store ordered stable layers/groups, visibility, opacity, blend modes, transforms,
source assets and per-layer stacks. Parenting is acyclic, one owner per child.
Masks have IDs, raster/vector kind, source reference, coordinate space, transform,
inversion and compositing rules. Preserve live mask/effect intent, not merely a
composite. Unsupported semantic blends/effects are required features. Depth,
channels/color/alpha are explicit; a thumbnail cannot replace HDR/CMYK/16-bit data.

### 6.3 Vector scenes

Preserve tree, groups, shapes, paths, text, styles, transforms, order, constraints
and asset references. Paths/handles retain IDs and schema-defined conventions.
SVG can be an original/interchange/preview asset, not a flattening escape hatch.
Current vector-core uses absolute handles; an adapter must not lose precision
through the three-decimal SVG serialization path described in its documentation.

### 6.4 Layout, web and text

Layout preserves pages/spreads, frames, stories, styles, overflow and font/image
links. A PDF source/snapshot does not prove recovery of original text-flow rules.
Web/code models reference real UTF-8 source assets and stable selection/link
metadata; do not regenerate arbitrary HTML from a scene on normal save. Office
loss reports remain attached. These are future contracts, not shipped support.

### 6.5 Timeline references

Preserve sequence/track/clip IDs, ordering, source assets, in/out points, transforms,
effects, audio routing and timing metadata. Authoritative time is rational:
`{"numerator":"1001","denominator":"30000"}` seconds. Reduced canonical decimal
strings, positive denominator, schema-bounded values and explicit negative-position
rules avoid floating-point edit boundaries. Frame rates are rational too.

VFR sources retain timebase/sample timing; frame counts alone do not define time.
Rotation, HDR/color and audio layout/alignment are explicit. MP4/WAV etc. stay
ordinary media. Proxies/waveforms/thumbnails are derived, not new originals.
Unavailable codecs block dependent final export, not authorize replacement.

### 6.6 Studio links

Links have `id`, source/target `{documentId, objectId?}`, relation, binding mode
and optional snapshot. Relations distinguish placed assets, embedded documents
and derived renders. `live` follows committed source state; `pinned` binds a
specific source document digest. No privileged paths are stored.

Active render dependencies are acyclic in v1. Provenance-only links may cycle
but do not trigger evaluation. Broken targets retain link intent and diagnostics,
not silent flattening. Fallback snapshots are labeled stale/missing. Cross-project
links need a future explicit capability contract; v1 copies/imports documents
instead of automatically traversing other projects.

## 7. Previews and export recipes

Optional project/per-document PNG previews are indexed by hash. References record
width/height, source revision/hash and renderer identity. Default longest edges:
512 px thumbnail, 2048 px document preview. These are proposed derived-image
limits, not document limits. Independent sandboxed decoding needs no studio engine,
network or package-provided plugins. Stale previews are labeled/regenerated.

Validate ICC payloads; embed fonts only with rights. Otherwise preserve references
and missing-font diagnostics. Export recipes name document/revision, standard
format, adapter/version, dimensions, quality, color policy, frame rate/range and
known loss decisions. Destination paths are local-only. A recipe is neither a
fidelity promise nor permission to overwrite. Unsupported dependencies block final
export or require reviewed degraded export to a new file.

Packaging has a privacy review for originals, metadata, fonts, opaque extensions
and thumbnails. Do not automatically include provider keys/tokens, full AI chats,
local machine paths or `.som-work/`. Sensitive original content stays sensitive
when bundled; a hash does not redact it.

## 8. Atomic save, autosave and recovery

Use the existing FilePort/service boundary and permission/conflict model. Saved
means a committed durable generation, not memory edits, recovery cache or a
successful download request. Distinguish manual save, autosave and recovery.

### 8.1 Packed save transaction

1. Snapshot immutable state; acquire a local exclusive writer lock. Record the
   expected generation/file identity and root digest; detect external changes.
2. Build a new ZIP at a unique sibling temp path on the same filesystem, containing
   only active reachable payloads and retained indexed opaque data.
3. Validate schemas, features, references, hashes and ZIP inventory. Flush contents
   and OS buffers; no saved-state acknowledgement on failure.
4. Retain a verified last-good backup with explicit local retention/access policy.
5. Recheck the expected generation/root; use the platform atomic replace primitive.
   Never delete the target first or copy over it byte-by-byte.
6. Sync the containing directory where supported; read back and verify the new root
   and committed inventory before acknowledging success.

A local lock cannot stop unrelated writers. Compare-and-replace is not available
on all filesystems: use identity/hash conflict checks and platform coordination,
and document residual races. Rename success alone does not prove durability.
Network/removable/cloud-sync filesystems need a tested guarantee or safe failure/
Save As with an explicit limitation. Full disk, lock/permission loss, conflict or
verification failure retains old-good and recoverable work, never false saved status.

### 8.2 Folder commit

1. Write new immutable content-addressed payloads via sibling temps; flush, verify
   and atomically install. Never replace differing bytes at an existing hash path.
2. Build a manifest referencing only durable installed payloads.
3. Save/flush a verified previous root under `.som-work/recovery/`.
4. Under writer lock/expected-root checks, atomically replace `manifest.json`,
   then sync its directory where supported.
5. Read back and validate the committed root before updating saved status.

This single root-pointer commit makes multi-file changes coherent. A crash before
root replacement leaves old-good plus unused blobs; after replacement new-good
references already durable payloads. Initial creation uses a staged new directory.
Readers select the validated root, never whichever document has the latest mtime.
Uncoordinated copies/Git checkouts require validation before claiming a snapshot.

### 8.3 Autosave, recovery and collection

Use bounded append-only journal segments with sequence numbers, checksums, base
generation IDs and complete commit boundaries. Autosave may commit a separate
recoverable root referencing durable blobs, without advancing the manual-save root.
Journal replay is not the only way to reopen canonical committed state.

After interruption, validate current root, backups and complete recovery generations.
Ignore incomplete segments/temps and refuse replay across mismatched bases. Offer
valid recovered work separately from last manual save, showing generation/time and
diagnostics. Do not choose by timestamp alone or overwrite the only good copy.
Corrupt-root recovery, conflict resolution and migration use a new destination.
Stale lock age alone does not authorize deleting another active writer's lock.

Garbage collection retains payloads reachable from active roots, backups, complete
recovery generations, pins and in-flight transactions. Opaque payloads declare
asset dependencies. Collect only after verified commit and retention decisions;
never collect linked originals outside the project.

Test real Windows/macOS/Linux filesystem semantics. Web File System Access and
fallback download have different guarantees: use private working/recovery state
plus complete export, surface external-write limits and never describe a download
as durable in-place replacement.

## 9. Schema migration

Migration registry keys exact source/target container and studio schema versions.
Code is shipped, offline, deterministic, bounded and cancellable, never a script
from the project. Validate source, feature gates and every intermediate graph.
Unknown major/features cannot gain write permission through a guessed migration.

Migrate a copy/new generation to a new destination, preserving original bytes,
IDs, opaque payloads and provenance. Record migration ID/version, source root digest,
source/target contracts and losses. Never overwrite the only original. Lossy
flattening/model reduction needs reviewed losses and is not automatic migration.

Test semantic invariants and reference pixels with pinned renderers; merely using
the newest renderer does not prove equivalence. App versions are not migration keys.
Publish supported schema ranges, migration graph and fixtures. Never reuse a
schema version for different meaning. Exact-byte copying remains available when
no supported migration exists.

## 10. Security and budgets

Opening grants no scripts, macros, network, font downloads, extension installation
or executable capability. Use isolated safe HTML/SVG rendering. Namespace names
are not publisher authentication. Future signatures/encryption need their own threat
model; ZIP crypto is excluded and SHA-256 is not authentication.

Proposed baseline budgets, subject to profiling before release:

| Boundary | v1 baseline |
| --- | --- |
| Inventory | 100,000 entries; bounded streaming parsing |
| Root manifest | 8 MiB expanded |
| Single document JSON | 32 MiB expanded; depth 64 |
| Preview decode | 16 MiB encoded; 16 megapixels decoded |
| Compression ratio | Above 200:1 quarantined; only explicit bounded override |
| Browser import/extraction | 512 MiB total expanded payload |
| Native default inspection | 20 GiB expanded; larger requires explicit budget |

These are safety proposals, not benchmarks or supported project-size promises.
Ceilings include opaque data. Read large native media by bounded random access,
not whole-video inflation into RAM. Enforce expanded bytes/ratios while reading,
not just from ZIP headers. Each adapter additionally bounds dimensions, layers,
frames, XML depth, memory, time and cancellation. Nested archives require their
own explicitly selected adapter/budget, not recursive automatic extraction.

Reject traversal, links/junctions, collisions, malformed/overlapping ZIP ranges,
inconsistent headers, encrypted entries and duplicate JSON keys before use.
Extract with no-follow/capability-based writes into a fresh controlled directory.
A refusal is preferable to a partial project that looks complete.

Extensions declare namespace, version, indexed paths, required/optional status
and asset dependencies. Optional means non-semantic to core output/editing, not
an essential effect hidden under a friendly flag. Preserve unknown JSON values
and binary bytes; execute neither. Malformed optional data is quarantined and
cannot silently vanish in a save claiming losslessness.

## 11. Determinism, tools and rollout

Canonical writer JSON: recursively sorted object keys, preserved array order,
UTF-8, two-space indentation, LF, one final newline. Define stable finite-number
serialization with test vectors; normalize negative zero. Rational/large integer
semantics use defined decimal strings. Hash actual stored bytes.

ZIP order: marker, manifest, payloads lexicographically by path. Fixed DOS timestamp
1980-01-01 00:00:00, regular-file attributes, no host-specific comments/extra fields
except required ZIP64 fields. Pin compressor/settings per writer build. Equal
payloads are logically equal across writers; byte-identical ZIPs need the same
pinned compressor, not merely the same JSON.

Proposed CLI, not shipped commands: `som inspect`, `som validate`, `som unpack`,
`som pack`, `som migrate`. All are offline; unpack defaults to a new safe folder.
Pack validates references and shows portability status. Standard asset extraction
must not require the full editor. Publish schemas, validator, feature/operation
contracts and fixtures under repository MIT terms; user assets retain their rights.

Implementation order:

1. Schemas, validator and manifest/asset/link fixtures.
2. Folder transactions and Raster/Vector adapters against real persistent models.
3. ZIP pack/unpack, previews, privacy review and recovery UI.
4. Layout/timeline only after their actual model/timing contracts exist.
5. Naming, registration, associations and platform release tests.

At the reviewed base, image state has `schemaVersion: 1` and operations with
`id/type/version/enabled/params`; vector operations share that wire pattern.
These guide adapters, not prove a complete persistence layer. Layers/masks,
layout/timeline, algorithm pinning and studio links here require implementation.
Do not rename an old project ZIP to `.som` and call this RFC implemented.

## 12. Acceptance and release gates

Fixtures and failure tests must demonstrate:

- Empty project; raster ops/layers/masks; vector IDs/handles; embedded/linked media;
  multiple studios using one logo. ZIP/folder reopen preserves intent and bytes.
- Unknown optional opaque data survives; unknown required/disabled operations,
  models/features and newer readers enter the specified gates without mutation.
- Unknown majors are quarantined; fake extensions/markers do not bypass detection.
- Missing media, exact relink and changed-hash reimport have distinct outcomes;
  fonts/profiles/proxies and pinned/stale links are diagnosed correctly.
- Each migration preserves the original and IDs/opaque data, exposes losses and
  passes semantic/reference-pixel comparisons.
- Kill/failure injection at every save/commit stage, full disk, permission/lock
  loss, external conflicts and corrupt backups: old-good, new-good or explicit
  recovery, never false saved status. Test real OS/filesystems, not mocks alone.
- Bombs, traversal, links, case/Unicode collisions, duplicate keys, malformed ZIP
  ranges, huge metadata and nested archives remain within budgets.
- ICC/depth/alpha/Unicode/font/VFR/rational timing retain declared semantics;
  unavailable codecs block dependent final export.
- Safe engine-independent previews cannot override state. Packaging excludes
  local paths/secrets. Collection retains backup/recovery/pinned/opaque references.
- Stable IDs/JSON give useful Git diffs; pinned deterministic writer tests pass.

Capability matrices separate detect, preview, import subset, editing, export and
third-party round-trip. A successful project save is not a fidelity test. Verify
standard exports in independent tools and third-party round-trip in the source
application before claiming compatibility.

## 13. Alternatives and open decisions

A new binary format would need new inspection tooling. Standards alone cannot
retain all editing intent. ZIP-only autosave is costly for media and poor for Git;
the folder representation avoids a second model. SQLite may suit caches, not
this portable interchange. An encrypted wrapper needs a separate authenticated
encryption/key/recovery design.

Open: final schemas/feature registry, pinned algorithm policy, serializer,
measured budgets, backup retention, filesystem matrix, LFS UX and naming.
This RFC adds no library/codec dependency or licensing decision. FFmpeg routes
and third-party adapters are separate work.

## 14. Sources

External pages read on 2026-10-08. Naming research is brief, not exhaustive. The
supplied *Somnia: offene Dateiformate* strategy dated 2026-10-08 is the internal
design input. Proposed architecture/limits are choices, not measured facts.

1. Webopedia, S extensions, updated 2021-05-24. Historical `.som` catalogue;
   not registration or legal clearance.
   https://www.webopedia.com/reference/fileextensionss/
2. fileextension.info, Corel Paradox sort information; secondary corroboration.
   https://fileextension.info/file/som
3. RFC 6838, vendor tree and registration/security requirements (2013).
   https://www.rfc-editor.org/rfc/rfc6838.html
4. IANA, media type application; registration route, not extension ownership.
   https://www.iana.org/form/media-types
5. IANA, Media Types. Incomplete retrieved view; no verified availability claim.
   https://www.iana.org/assignments/media-types/media-types.xhtml
6. Sketch developer file format; ZIP/JSON/assets/preview/schema precedent.
   https://developer.sketch.com/file-format/
7. OpenRaster baseline layout; first uncompressed marker and image/thumbnail
   packaging precedent, not full editing semantics.
   https://www.openraster.org/baseline/file-layout-spec.html
8. RFC 8259, JSON UTF-8, numbers and duplicate-name interoperability (2017).
   Canonicalization above is a separate proposed Somnia contract.
   https://www.rfc-editor.org/rfc/rfc8259.html
