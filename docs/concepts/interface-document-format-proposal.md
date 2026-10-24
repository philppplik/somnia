# Interface document persistence proposal

Status: partially merged on int/beta5 (pre-release line): validated version-1 JSON snapshots with `.json` ship in the Interface Studio. The format proposal itself remains under review. P0-P5 currently save validated version-1 JSON snapshots with `.json`. This document adds no file associations, reader, native writer or extension promises.

## Choice for review

Prefer `.somnia` as the host-owned project/container and a versioned Interface entry within it. Reserve `.sinterface` as a possible single-document exchange/archive format only if the format owner needs one. Do not ship two authoritative copies of the same editable document, rename Design's `.somdesign`, hijack SVG/FIG routing, or claim either proposed suffix is supported today.

| Candidate | Intended use | Cost / unresolved point |
| --- | --- | --- |
| `.somnia` | Host project carries studio identity, Interface scene entry, assets and project metadata | Requires agreement on existing container manifest, entry naming, native persistence lifecycle and migration rules |
| `.sinterface` | Optional portable Interface-only document | Requires MIME/extension ownership, identification, archive policy and separate routing tests; increases format maintenance |
| Current `.json` snapshot | Local validated scene, embedded canonical images, explicit Open snapshot | Implemented bounded interchange/recovery, not a project container or named format claim |

The earlier concept's `.somui` was a placeholder. `.sinterface` is a new candidate requested for review, not a silent decision to replace it. Final label and extension need one format-owner decision.

## Proposed logical payload

A future container manifest identifies studio `interface`, scene schema version, document id and a single authoritative scene entry. Preserve stable page/node/component/variant/slot/token ids, local asset provenance and annotations. Scene fields use the existing validated model, with explicit required-version rejection. Assets should be content-addressed canonical PNG entries with their hash, dimensions and source/license metadata; no external resource fetch. Generic font policy and text-measurement limitations must remain visible.

Entry names and manifest keys are intentionally not fixed here: check the live host/container schema before implementation rather than creating a parallel schema. Migration is explicit, deterministic and loss-reported. Known safe optional unknown fields can round-trip under current validation; required unknown semantics must reject rather than vanish. A versioned migration must never replace the original until a confirmed new file write completes.

Do not persist selection, hover, drag/pen previews, snap controls, viewport caches, generated CSS inspection or frozen export previews as source content. Readiness is manual metadata, not certification. Do not add prototype fields before their version and runtime are approved.

## Save/open lifecycle

Host owns path choice, overwrite review, serialization and file handles. Freeze document id/revision, validate references and assets, write to a safe temporary destination, atomically replace where the host supports it, then clear dirty only if the current id/revision still matches the completed write. Cancellation, write/close failure or an edit during save leaves dirty/recovery intact. Downloads are copies, not confirmed saves. Current browser snapshot behavior already follows that distinction; native container integration is not implemented.

Open detects content kind/version before router adoption. Validate the entire candidate before replacing the working scene. Dirty replacement asks the owner. Keep corrupt recovery available for recovery rather than deleting it. A container reader rejects absolute paths, traversal, duplicate/conflicting entries, symlinks, excessive expansion and unsupported required versions before decoding content. Never execute imported code, links or annotations. No remote font/asset fetch or plugin commands.

Current JSON limits remain 5 MB scene/recovery, 3 MB embedded data and 50 assets, with per-image 1 MB / 4096px / 4 MP preflight and canonical decoding. Future archives need separately measured compressed/uncompressed budgets, hash verification, count/depth caps and worker/native cancellation. Existing limits are not evidence that zip expansion is safe.

## Required gates before adoption

1. Format owner selects container-only or container plus standalone exchange, plus final naming/MIME. Inspect current host container version and route priorities.
2. Corpus tests: same-version lossless reopen, migration loss reports, nested layout/variants/overrides/tokens/images, corrupt refs/versions/assets and unknown safe fields.
3. Malicious archives: traversal, absolute paths, duplicate entries, symlinks, zip bombs, forged metadata, mismatched hashes and excessive depth/count. No network or code execution.
4. Lifecycle tests: failed/cancelled save, exact-revision save while editing, crash/recovery, dirty replacement and unknown-version refusal. Native atomic write and sandbox permissions need their own tests.
5. Shell integration: Interface identity persists on reopen; Design/Vector/SVG routing unchanged; one authoritative document, command and inspector ownership; no duplicate save control.

Until these gates pass, keep explicit JSON snapshots and project-format adoption out of release claims. This proposal introduces no SDK, AI/provider, network, collaboration or spending permission.

## P8 experimental local library snapshot

The Interface library browser can now download `interface-library.experimental.somnia`, a plain validated version-1 Interface JSON scene carrying a `somnia-interface-local-library` experimental marker and source revision. It includes the entire current document, not a minimal reusable component package. This is explicitly not the native `.somnia` project/container above, adds no global file association and opens only through Interface's explicit snapshot picker. Downloads leave source dirty/history/recovery unchanged. Keep experimental naming and warning until format-owner review chooses a container/library interchange design.
