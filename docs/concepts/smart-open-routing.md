# Smart Open: document-aware Studio routing

Status: proposed UX and integration contract, not implemented.
Research date: 2026-10-09.
Baseline: `somnia-agent` at `08ec56fbbd7c8f8406c8f249f03dad422a2b12b4`, a documentation-only successor of requested `6d9a126`.

## Product rule

**Open the document in the editor that can actually handle it. Keep everything else safe.**

Opening a valid DOCX while Video is selected brings the document into Documents. It does not convert the DOCX, insert it into the timeline, close the video project or clear its undo history. This applies with an existing project as well as on an empty start. Studio selection is not a permanent lock on future documents.

Routing is local and deterministic. No AI, network classification or content upload is involved. A file extension is a useful hint, not evidence that the bytes are a valid document.

## Reference findings and decisions

| Reference | Verified observation | Somnia decision |
| --- | --- | --- |
| VS Code resolver contract [1] | Separate editor registrations, priority levels, explicit selection and user associations; resolver can abort or yield no result. | One resolver with explicit outcomes and document-scoped overrides. |
| VS Code issue #137675 [2] | Historical startup/reopen precedence regression concerning user editor associations. This is regression evidence, not a current unresolved defect claim. | Test startup, restore, reopen and explicit Open with independently. |
| Figma file browser [3] | Import supports multiple document types; file-picker and drag/drop are both documented. | One policy behind different intake adapters. |
| Figma import guide [4] | Distinguishes design-file imports from assets placed in an existing design. | Opening a document and importing an asset are different intents. |
| Illustrator formats [5] | Lists supported formats separately for Open, Place, Save and Export. | Read, edit, place and write are separate capabilities; a preview does not imply native editing or round-trip saving. |
| Apple document architecture [6] | A document controller selects a class using declared types and read/edit roles; a document owns its data model. | The shell follows an active document session, not a filename-specific side effect in an unrelated component. |
| Illustrator community explanation [7] | Explains practical open/place/embed distinctions and warns SVG import can lose unsupported structure. Secondary evidence only. | Preserve source and surface importer diagnostics; do not silently convert. |

These products are references for mechanisms, not evidence that they implement Somnia's exact cross-Studio behavior. No source code is copied by this concept.

## Current Somnia behavior

Inspected repository paths, relative to repository root:

- `phase1/src/lib/studios/registry.ts`: `StudioDef.formats` supplies `ext`, optional `mime`, and `priority`. `acceptsFormat` checks extensions including `*`, but does not select or validate an editor. Code claims `*`; it must not become a binary catch-all.
- `phase1/src/lib/studios/index.ts`: registers Code, Documents, Sheets, Slides, Sound and Video. Photos, Vector, Design and a dedicated PDF Studio are not registered on this baseline.
- `phase1/src/store/appStore.ts`: `requestStudio(id, source, pendingTool, tabKey)` switches the shell and remembers a tab. Its global `studioChoice === 'manual'` refuses subsequent automatic routing. `openFileTab` selects a remembered accepted Studio or Code. `studioByTab` does not yet unify all document stores.
- `phase1/src/lib/studios/documentsRouting.ts`: a media subscription requests Documents for DOCX and returns to Code otherwise. It competes with other routing sources and inherits the global manual veto.
- `phase1/src/lib/media.ts`: probes image/audio/video bytes and Office packages, creates media items and URLs, and has explicit PPTX routing in both add and activate. Close guards exist, but guards for every dirty studio must be verified individually. Office probing is entered by Office suffix: content-first extensionless recognition is not already complete.
- `phase1/src/components/sound/SoundWorkspace.tsx` and `video/VideoWorkspace.tsx`: mounting the workspaces requests their Studio. Effects should not compete with the open coordinator.
- `phase1/src/lib/projectActions.ts`: browser intake classifies by text/media suffix and uses `addTextFiles` / `addMediaFiles`. Text imports add files to an existing project; media with a duplicate key may replace after its registered guards.
- `phase1/src/components/DropOverlay.tsx`: browser app drops flow to `readFiles` and `addTextFiles`; chat/conversion-target drops are excluded. Desktop overlay listens to native drag state rather than opening the files itself.
- `phase1/src/lib/fileAdapter.ts`: native `project.openFile` binds to `choose_file` through `open`; single non-media OS drops can replace a project through `open_dropped_project`, other drops read copies through `read_dropped_files`. Native replacement guards primarily inspect the core dirty state. The initial native media path filter is PNG/JPEG/PDF even though the folder loader supports the broader media regex.
- `phase1/src/lib/folderMedia.ts`: loads through `read_media` with per-file and aggregate limits. Each `addMediaFile` activates an item before the loader clears active media; background loading must not route or flash the shell.
- `phase1/src/components/studios/hosts.tsx`: maps canvas/inspector/sidebar hosts; Slides can fall back to a Code host for incompatible active media. Smart Open must not claim success while the pill and actual host disagree.
- `phase1/src/lib/agent/documentCore.ts`: has its own `studioFor(path)` classification. Reconcile document identity and route metadata without letting AI classification control opening.
- Native argv, single-instance file delivery, custom URI deep links and macOS opened-file events were searched in `phase1/src-tauri` and frontend source. No relevant implemented receiver was found in this baseline. Issue #164 covers Windows associations separately; do not label those routes working until an end-to-end receiver exists.

### Queued work, not merged baseline facts

The parent supplied blank and starter patch series for review. They were inspected as patches, not represented as installed behavior:

- `phase1/src/lib/studios/blank.ts`: `createBlankProject(studioId): Promise<void>`; `registerBlankProjectFactory(studioId, () => void | Promise<void>): () => void`; lazy dependency loading, registered factories and in-flight creation deduplication. The built-in paths can create valid Office packages and media, including an empty `video-project`. Explicit blank creation ends with a manual Studio choice. This must remain an explicit create intent, not a file classifier operation.
- Shared `StudioEmptyState` / starter copy and six host integrations expose Open and Create blank project actions, including busy and error states. Wire Open to the coordinator, retaining the shared component and wording.
- Design shared-Core seams were reported by the parent, not read from a Design patch: `.somdesign` open/drop calls `parseDesignDocument(text)`, checks dirty replacement, calls `loadDesign(doc)` and then `requestStudio('design')`. Save serializes `getDesignState().document`; `markDesignSaved()` follows a real successful write. Native close/reset includes Design dirty state; global undo/redo delegates. `.somnia` and draft restoration remain separate.
- Vector integration was reported as `vectorio.VectorDocument` with a strict SVG importer and diagnostics. The actual adapter/host registration must be verified on integration. Do not advertise a ready Vector/Design/Photos entry merely because blank generation or tools exist.

## Interaction contract

### Open versus import

Every incoming action carries an explicit intent:

| Intent | Examples | Routing |
| --- | --- | --- |
| Open document | Project > Open File, global drop, OS association, file activation | Resolve document editor and activate once. |
| Import asset | Video Add source, canvas Place image, media bin drop | Keep destination Studio; validate the destination import capability. |
| Attach / convert | Chat drop, Convert files window | Do not create an editor session or route the shell. |
| Create blank | Starter Create blank project | Use the requested factory and Studio explicitly. |
| Restore | Existing tab/session restoration | Restore its valid handler without reimport or conversion. |
| Load in background | Folder media enumeration, prefetch | Register availability only; never activate or switch. |

A drop into a dedicated import target never bubbles into global Open. An app-level drop outside those targets means Open. If a target does not support that asset, show its own error rather than silently opening another Studio.

### Resolution order

1. Identify intent, trusted local source handle and document identity. Normalize case and suffix safely; never use basename as the unique identity for native files.
2. Inspect enough bytes within existing limits to classify and validate the candidate. MIME and suffix narrow candidate readers, but never overrule contradictory content or decoder failure. Container formats need package validation, not only ZIP magic. Native paths require existing grants; a URI is not a path grant.
3. Reuse an already-open session for the same identity, without rereading over dirty buffers. Browser imports lacking stable source identity use a session ID; equal basenames do not prove equal documents.
4. Honor an explicit compatible Open with target, then a compatible per-document override, then an optional compatible saved format association.
5. Match only ready registered handlers that can read the validated kind. Specific validated handlers rank above a text wildcard. Registry priority breaks a clear ranking; equally valid candidates without a product default prompt rather than depend on module initialization order.
6. If there is no editor, allow a verified read-only preview when available. Unknown binary stays unopened. Unknown text may offer Code only after text/binary and encoding checks within limits. There is no blind 'try the current Studio' path.
7. Prepare the reader and candidate session without replacing the old session. Enforce replacement and pending-interaction guards. Commit the document and its shell together only after preparation succeeds.

A content/suffix mismatch must not silently change a document's filename or save format. Example: JPEG bytes named `draft.docx` display a mismatch with an explicit 'Open as image' option when a ready image handler exists. No new extension or overwritten source is implied. A corrupt real DOCX stays an error, not a text buffer of ZIP bytes.

### Proposed format destinations

| Validated kind | Destination | Availability rule |
| --- | --- | --- |
| DOCX | Documents | Actual document parser/canvas ready. |
| XLSX | Sheets | Engine ready; unsupported workbook features reported. |
| PPTX | Slides | Engine ready; importer warnings visible. |
| Supported audio | Sound | Container and decoder support checked; suffix list alone is not a codec guarantee. |
| Supported video | Video | Container/codec support checked; unsupported codecs report an error. |
| HTML/CSS/JS/JSON/Markdown/LaTeX and verified text | Code | Explicit text allowlist or safe text fallback. Markdown remains Code by default. |
| SVG | Vector when ready, otherwise Code | Valid SVG text; strict Vector importer must not silently lose unsupported nodes. Offer Code on incompatibility. SVG scripts and external resources are not executed during classification/preview. |
| Raster / PSD | Photos when a ready compatible host exists; otherwise current verified preview capability | Preserve layered versus flat/read-only distinction. No fake Photos registry entry. |
| PDF | Existing verified PDF editor/preview capability | Do not invent a dedicated Documents/PDF Studio until registered. Read-only fallback must say read-only. |
| `.somdesign` | Design when ready | Parse schema and version, use own store and dirty guard. No PDF substitution. |
| `.somnia` container | Existing project/container loader | Restore project semantics; do not route it as a standalone text document. |
| Folder | Existing project loader | No switch per background file; activate the selected/restored project document once. |
| Unknown | Safe text offer or unsupported-format error | Never treat binary as Code merely because Code accepts `*`. |

### Manual selection, return and preferences

- Clicking a Studio pill means visiting that Studio now. It may show its own empty starter if the active document is incompatible. It does not relabel that document or block the next explicit Open.
- A deliberate compatible Open with choice belongs to that document. Returning to it restores its Studio and view/selection/scroll/zoom.
- Preserve global shell positions and AI sidebar. Change tools and inspectors only for the active editor; never reorder the Studio pill or rails.
- Provide Return to previous document using existing tab navigation or a small status action. It is navigation, not Ctrl+Z. Closing or returning is subject to normal dirty guards; content undo remains owned by its editor.
- No global 'never route' toggle in v1: it contradicts the requested behavior and creates misleading incompatible views. If repeated compatible choices justify it later, add an explicit 'Use for this format' option and reset in Settings. Never remember a fallback for all binary files.
- The current global manual veto must be replaced or bypassed with a document-open policy. Do not remove it wholesale while existing routing effects still race: first centralize those effects and distinguish visit, open, import and restore.

### Multiple files, async work and failure

- Use supplied FileList/native path order. Validate/load independently, retain successful sessions, focus the first successful document once after the batch settles. No focus switch per decoded item.
- Summary: 'Opened 3 files. 1 could not be opened.' Details use existing Problems/status infrastructure. Partial failure never pretends the whole batch succeeded.
- Deduplicate stable identities. Distinct files sharing a basename retain separate identities and labels/path tooltips; imported copies follow explicit collision policy, not silent replacement.
- Newer explicit Open requests supersede older pending focus changes. Carry generation/request IDs and cancellation; a slow old reader cannot hijack the shell after a newer open or project close. Release temporary resources when cancelled or rejected.
- Loading does not freeze unrelated work. Disable the relevant pending action and expose busy state. If the current session changed during preparation, recheck guards before commit.
- A pending drag/text edit/tool gesture is finished through its editor's supported transaction boundary, or the open waits/cancels. No shell switch that abandons an uncommitted gesture.
- Reader failure, unsupported type, cancellation and chooser dismissal leave old session/shell unchanged. If an adapter can only replace, do not ship unsafe 'preserve all documents' claims: use Save / Discard / Cancel and keep the candidate separate until success.
- No automatic disk write, conversion or mark-saved during routing. Native opened originals retain save-in-place rights; browser/imported copies stay unsaved copies unless the existing picker grants write access.

### Entry points and feedback

All implemented entry points share policy, not necessarily identical storage semantics. Project > Open File and starter Open buttons use the same coordinator and handler list. Studio-specific filters help discovery but are not a validation gate; where the platform permits, offer All supported files so choosing a DOCX from Video still works.

Deep links/CLI/OS callbacks must resolve local grants, validate payloads and enqueue after app readiness. They cannot fetch arbitrary URLs, execute shell strings, bypass dirty guards or duplicate a delivered file when opening a second instance. Add receiver-specific tests when those adapters are implemented. Windows association registration alone does not prove file delivery.

Use existing status text and the pill's polite live announcement, e.g. 'Opened report.docx in Documents.' Do not add a permanent banner or a success modal. Focus the new editor after success; on failure keep focus on the initiating control and expose an accessible error. Empty starters remain centered, English and minimal. Copy reports genuine reader limits instead of 'coming soon' buttons.

## Integration architecture proposal

The names below are proposed contracts, not existing APIs.

- A resolver returns a discriminated result: `ready`, `choose-handler`, `safe-text-offer`, `unsupported`, `invalid`, `cancelled`. Its output includes validated kind, candidate handler ID, capabilities, reason and diagnostics.
- A handler is registered alongside its Studio: accepted validated kinds; readiness; read/preview/edit/place/write capabilities; `prepareOpen`, `activate`, replacement/dirty guard, restore and cleanup hooks. A generated blank factory is a separate registration, not proof of read capability.
- A document session has stable identity, origin/source handle, path/name, validated kind, selected handler/Studio, dirty state, content store owner and persistence capabilities. Media keys and source-file tabs become projections of that identity rather than competing route authorities.
- An open coordinator owns intent, request IDs, reader preparation, batch order, guards and activation. It calls `requestStudio` at one successful activation boundary with the correct document key. Text tab activation, media activation and close-neighbor activation follow the same path.
- Add a no-activate/background option to media ingestion or split ingestion from activation. Remove hard-coded DOCX/PPTX redirects and mount-driven Sound/Video routing only after parity tests prove the centralized replacement.
- Ready Design registration uses `parseDesignDocument` / `loadDesign`, includes its dirty store and native save/close hooks. Vector registers strict SVG import and warnings; Photos/PDF explicitly state preview versus editing. Verify these exact APIs against merged sources before writing implementation.
- The main integrator owns shared `appStore`, intake/native seams, host registry and test script changes; Studio contributors own parsers, sessions, dirty hooks and handler implementations. This avoids competing shared-Core patches.

## Acceptance and verification plan

### Unit tests

Resolver: case-insensitive suffix; extensionless and misleading suffixes; MIME disagreement; valid versus malformed Office ZIP; specific priority over wildcard; equal-priority ambiguity; unloaded handler; compatible/incompatible overrides; safe text versus binary; SVG strict-import diagnostics; session identity and duplicates.

Coordinator: explicit Open after manual Video; background load does not route; batch focus once; duplicate native delivery; concurrent opens and stale readers; cancel/invalid/failed prepare leaves old state; replacement guard accepts/rejects; pending gestures; temporary URL cleanup; navigation does not enter content history.

### Integration tests

- DOCX/XLSX/PPTX from every implemented intake surface while Video is manually selected.
- Dirty Video/Code/Design/Vector sessions survive new open; single-session replacement prompts correctly and saves only after a real write.
- Revisit text/media/Design/Vector tabs and close active tabs: correct shell, buffer, selection and history return.
- Browser/native picker and drop select the same editor while retaining copy/save-in-place differences.
- Folder load and restore do not oscillate through each media Studio.
- Chat attachments, conversion drops and timeline/canvas asset intake do not route.
- Generated blank factory remains explicit and does not leave a global lock blocking later document Open.
- Native association, argv, second-instance and macOS file delivery tests are required only for implemented receivers; missing receivers stay documented, not green simulated tests.

### Visual and native QA gate

Actual app pixels in light/dark themes and narrow windows: Studio pill matches actual canvas/inspector; no flicker or duplicate controls; readable status; accessible busy/error state; keyboard focus and announcements. Test with real engines and native WebView/Windows build. Unit tests and isolated harness screenshots alone do not establish desktop parity.

### Documentation gate

English user guide: Open versus import, source/copy behavior, supported editing limits, errors and per-document choices. English developer guide: handler lifecycle, dirty/save ownership, native grants, registration, background intake and test recipes. Update supported-format docs from real capabilities, not extension wishlists.

## Decisions and remaining questions

Proposed defaults resolve ordinary interaction choices without blocking development: always route explicit document opens; per-document memory; batch first-success focus; no global opt-out; safe unknown handling; preserve sessions or prompt before replacement.

No additional product question is required to start the shared resolver/coordinator. SVG/PDF/Photos final defaults depend on which real handlers are integrated and capable. If two equally capable ready editors remain after that check, ask only which should be the default, with the concrete supported alternatives. Native single-session stores may require follow-on session work; do not hide that behind an automatic switch.

## Sources

All fetched on 2026-10-09. Repository findings come from a fresh public clone at the pinned SHA; queued patch findings come from the transferred patches.

1. Microsoft VS Code, editor resolver contract, primary source code (pinned search result; no publication date asserted): https://github.com/microsoft/vscode/blob/234229df/src/vs/workbench/services/editor/common/editorResolverService.ts
2. Microsoft VS Code issue #137675, community bug report with maintainer discussion, opened 2021-11-22: https://github.com/microsoft/vscode/issues/137675
3. Figma Learn, Import files to the file browser, official help: https://help.figma.com/hc/en-us/articles/360041003114-Import-files-to-the-file-browser
4. Figma Learn, Guide to imports in Figma Design, official help: https://help.figma.com/hc/en-us/articles/360040027794-Guide-to-imports-in-Figma-Design
5. Adobe Illustrator, Supported file formats, official help, page states updated 2025-10-27: https://helpx.adobe.com/illustrator/desktop/get-started/learn-the-basics/supported-file-formats.html
6. Apple, Designing a Document-Based App, archived primary architecture documentation; use for architecture, not modern API-version claims: https://developer.apple.com/library/archive/documentation/DataManagement/Conceptual/DocBasedAppProgrammingGuideForOSX/Designing/Designing.html
7. Graphic Design Stack Exchange, What is the difference between embed, open, link and place files?, secondary community explanation, 2017-08-30: https://graphicdesign.stackexchange.com/questions/97533/what-is-the-difference-between-embed-open-link-and-place-files
8. Somnia live repository: https://github.com/philppplik/somnia
9. Related Windows file-association issue, observed in live issue listing: https://github.com/philppplik/somnia/issues/164
