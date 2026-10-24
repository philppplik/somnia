# Folder and multi-source search selection proposal (BC)

Status: design only, not approved scope or an implemented folder picker. The live
milestone remains explicitly selected visible open `.txt`/`.md` sources, exact
optional `embeddinggemma:300m`, memory-only search snippets, no generated answers.
BA provides optional model review; BB provides safe feedback/keyboard query. This
proposal grants no disk read, closed-source inference, downloads or disclosure.

## Recommended next scope, before live directory traversal

Start with a chooser over text already loaded in the current project's editor
map, including closed tabs only after a separate scope decision. Label this
"Loaded project texts", not "Search folder": the map is not a complete disk
inventory. A folder tree is a grouping of this catalog, not permission to index
all descendants. No parent/home/workspace chooser and no recursive live scan.

Users select individual eligible files, with zero selected by default. Choosing
or expanding a folder merely reveals catalog rows. An explicit "Select eligible
loaded texts in this group" may check visible eligible children only, with a
selection preview and limits before Build. New files never join a reviewed
selection automatically. Open-text mode remains a separate, clear option.

Decision needed before implementation: permit closed but already loaded visible
`.txt`/`.md` text from this project, or retain open texts only? Native disk-folder
support is a later decision, not implied by either choice.

## Review and snapshot contract

1. Preview shows project identity, full relative source paths, source origin
   (editor buffer, including unsaved edits), per-file/total UTF-8 bytes and count.
   No claim that these are current saved disk contents. Display omitted counts
   and reasons; not inaccessible secret path names. No automatic text preview.
2. Maintain existing bounds: at most 32 sources, 262144 aggregate raw UTF-8 bytes,
   256 chunks, default 2048 bytes/chunk. Validate normalized chunks too because
   NFC/LF processing can change size. Never truncate, first-N select or silently
   omit a checked file to fit. Build disabled with actionable limit reasons.
3. File extension is eligibility, not secret detection. Visible text can contain
   credentials or third-party private data. Notice must say selected text goes
   to the reviewed local runtime and stays in a memory index. Loopback alone is
   not proof of local inference; retain adapter verification and no cloud fallback.
4. Reject hidden path components, non-text formats, malformed/control IDs/text,
   duplicate identities and unsupported long IDs. Current chunk contract uses
   source ID length <=100: show excluded long-path reason, never shorten two IDs
   into collisions. Full canonical host IDs must remain separate from labels if
   a later phase changes that contract.
5. Explicit Build freezes IDs/order/raw text and owner generation. The current
   synchronous recapture gate must compare the same selection before commit and
   query. On selected text edit/delete/rename, project switch, selection change
   or owner/disclosure close, abort and discard; rebuild is explicit. Unselected
   catalog additions do not change the frozen selection or authorize reading.
6. Citation resolves only against current reviewed source identity; it may open
   a previously closed eligible tab after rechecking revision. Never use an
   embedding/model-selected path or URL. Span highlighting needs separate raw
   versus NFC/LF offset mapping; ordinal chunk is not a raw cursor position.

## Later disk-folder mode: separate host contract required

Do not reuse project opening as a "search folder" shortcut: it can replace the
current project and trigger normal recovery/autosave behavior. Existing FilePort
list/read commands service the project editor, not a bounded read-only search
manifest. Existing native traversal skips symlinks/reserved folders and uses path
checks, but that is not proof of a cancellable/bounded search scanner, nor web
parity. Its existing walk has depth/file-count limits; project document reads also
have 2048-document/64MiB guards. Those larger project-load bounds are not search
budgets. Do not call project-wide `list_files` then apply a search cap only after
its already-completed enumeration.

A future host must expose a read-only manifest within an explicitly chosen root,
with owner/root identity, bounded enumeration, per-entry type/size/revision, strict
text decoding and a cancellation handle. Never follow symlinks/junctions or escape
the root; revalidate at read time against replacement/TOCTOU. Unknown host identity
or unavailable path guarantees block that entry/mode, not renderer fallback.
No writes/autosave, file creation, recovery copies, disk caches or embeddings until
selected bounded text is reviewed. Names-only enumeration and text acquisition are
different states; user must know which has occurred. No remembered background scan
or watch/rebuild after reopening, nor disk persistence of vectors/manifests/text.

Proposed scan limits (not existing implementation facts): 1000 discovered entries,
16 levels, 10 seconds, single-owner cancellation. Hitting any bound reports an
incomplete catalog, never claims "all files". Text selected for Build still obeys
existing 32/256KiB/256 limits. Browser filesystem and native metadata need explicit
parity acceptance; unsupported hosts keep current open-text mode.

Disk revision/content must be reconciled with dirty editor buffers: no silent
choice of disk over edits, or opening tabs that overwrites unsaved state. Prefer
editor source when present, label it, otherwise disk snapshot at reviewed revision.
If a selected disk source changes during scan/read/build/query/citation, discard
and require renewed review rather than silently accepting newer text. Existing
LocalSearchSession's synchronous JS recapture alone cannot certify native disk
atomicity; a host snapshot/revision lease is required before wiring this mode.

## Acceptance gates and phase order

| Phase | Required evidence before calling it done |
| --- | --- |
| Pure catalog/selection contract | zero defaults; stable full identity; hidden/binary/long/control/duplicate rejection; exact bounds and explicit overflow; new catalog entries never selected; no IO |
| Loaded-project chooser after scope approval | mode/source-origin labels; unsaved edit handling; keyboard tree/checkbox navigation; five locales; light/dark/narrow pixels; no auto embedding; explicit selected-only payloads |
| Read-only host manifest after separate disk scope approval | root escape/symlink/junction/replacement attacks; bounded cancellation/enumeration; strict UTF-8; no writes; native/web parity or honest unsupported state; CI evidence |
| Snapshot/build/citation integration | mutation at every await; owner switch/close; stale and cancelled completions never publish; unchanged selected-only captures; revision recheck before citation, no URL/path injection |

Do not weaken current bounds/tests to enable a big folder demo. Native/Rust/WASM
and packaged desktop E2E remain CI-only. Mock manifest tests cannot establish
actual disk isolation, local inference or secure erasure. Clearing references is
not physical erasure of strings held by unresolved transports.

## Grounding in current source

- `src/components/agent/LocalSearchPanel.tsx`: openSearchTexts whitelist, explicit
  selection, model setup, owner/source effects and host citation recheck.
- `src/lib/agent/localSearch.ts`: exact source validation/UTF-8/count/chunk limits.
- `src/lib/agent/localIndexChunks.ts`: NFC/LF pipeline, raw and normalized hashes.
- `src/lib/agent/localSearchSession.ts`: synchronous capture/compare, generation,
  owned abort, memory lifecycle. No filesystem acquisition contract.
- `src/lib/fileAdapter.ts`: choose/open/list/read and editor attach/recovery/save
  responsibilities. A search mode must not borrow their effects.
- `src-tauri/src/service.rs` Project path checks/walk: canonical-root/symlink rules;
  no search-specific bounded manifest acceptance claimed from source inspection.
- AZ/AY/BA/BB concept notes: implemented narrow scope and explicit caveats.

Roadmap-Delta: folder/multi-source selection decision and phased acceptance design
added. No runtime, source-scope, dependency, wallet or release-readiness change.
