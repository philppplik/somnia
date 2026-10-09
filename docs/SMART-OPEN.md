# Smart Open: implementation notes

Concept and UX contract: `docs/concepts/smart-open-routing.md` (issue #166). This page describes what the code does.

## Rule

An explicit **Open** resolves the document by its validated content and switches to the Studio that can handle it, even when the user is in another Studio. There is no global "manual" lock for Open. The choice belongs to the document (`studioByTab`).

## Pieces (`phase1/src/lib/studios/`)

| File | Role |
| --- | --- |
| `openHandlers.ts` | Handler registry: `kind -> Studio`, priority, `edit` or `preview`. A rule is only used while its Studio is registered (`readyHandlersFor`). |
| `openResolver.ts` | Pure and local. `classify` (content first, suffix is a hint), `resolveOpen` returns `ready`, `choose-handler`, `safe-text-offer`, `unsupported` or `invalid`. |
| `openCoordinator.ts` | The one coordinator. Prepare-then-commit, request generations, batch focus, pending-gesture guard, summary. Dependency-injected, no app store import. |
| `openIntake.ts` | App wiring (text and media adapters, `requestStudio(..., 'open')`). Entry: `openIncoming(files)`. |
| `studioRouting.ts` | Tab navigation routing for the active media item. Replaces `documentsRouting.ts`, the PPTX redirects in `media.ts` and the mount effects in Sound/Video workspaces. |

## Behaviour

- **Intent.** Only `open` moves the shell. `restore` and `background` commit without focus. Import (Video add source, canvas Place), attach/convert (chat, Convert window) and create-blank do not go through the coordinator.
- **Resolution.** Explicit target, then a compatible per-document override (`studioByTab`), then priority. Equal priority without `isDefault` returns `choose-handler`. A content/suffix mismatch (JPEG named `.docx`) returns `choose-handler`, never renames or converts. A corrupt Office file is `invalid`.
- **Unknown input.** Unknown binary and ZIP packages are `unsupported` and stay unopened. Unknown suffix with valid text (no NUL bytes, size limit 2 MB) returns `safe-text-offer`; it opens in Code only with `acceptTextOffer`.
- **Prepare-then-commit.** `prepareMediaFile` (in `media.ts`) validates and decodes without touching the media list. Sessions are committed only after the whole batch is prepared and still current. A failed prepare, a replacement guard that says no at commit time, a cancelled or superseded request all leave the old session and Studio untouched, and release temporary object URLs.
- **Batch.** Input order is kept. Every success is committed in the background, only the first is focused, and the Studio switches once. Summary: `Opened 3 files. 1 could not be opened: ...`. A newer Open supersedes an older pending one.
- **Manual choice.** The pill is a visit (`requestStudio(id)` = `manual`). `requestStudio(id,'open')` ignores a previous manual visit and stores `studioChoice='automatic'`, so one Open never locks later ones. Tab navigation (`studioRouting.ts`) still respects a manual visit.
- **Return.** Previous documents stay as tabs. Returning is tab navigation, not undo.
- **Folder load.** `addMediaFile(..., {activate:false})`: availability only, no routing flash.

## Adding a Studio

1. Register the Studio (`registerStudio`).
2. Register handlers once: `registerOpenHandler({id,studioId,kinds,priority,capability})`.
3. Add its adapter branch in `openIntake.ts` (`prepare`) if it is not text or media-backed.

## Queued dependencies (not on this branch)

- **Vector Studio**: rule `open.vector` (svg, priority 50) is already declared and inert. Needs the Studio, a strict SVG import adapter that rejects incompatible SVG at `prepare` (Code then takes over), and an `openIntake` branch.
- **Design Studio**: `.somdesign` needs a `somdesign` kind, `parseDesignDocument` / `loadDesign` in a `prepare`/`commit` adapter, the dirty-replacement guard, then `requestStudio('design','open')` through the coordinator. Today valid `.somdesign` JSON is only a `safe-text-offer` for Code.
- **Photos Studio**: rule `open.photos` (image, raster-preview, psd) declared and inert. Until it exists, raster/PDF/PSD keep the read-only preview (`open.code.preview`), reported as such.
- **Blank/starter**: Open buttons in the starter component call `openIncoming` / `project.openFile`; Create blank stays an explicit factory and should call `requestStudio(id,'open')`, not set a manual lock.
- Offers (`choose-handler`, `safe-text-offer`) are returned in the report and written to the status line; the "Open as..." UI is not built yet.
- Native single-file `choose_file` / `open_dropped_project` replacement path, argv/second-instance/deep-link receivers (issue #164) are unchanged; no receiver exists yet.
