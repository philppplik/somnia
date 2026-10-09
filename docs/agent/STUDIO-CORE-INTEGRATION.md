# Studio-aware Somnia Agent

The global Agent sidebar now uses one document registry and one reviewed
transaction boundary across the studio workspaces. It follows the visible
workspace instead of assuming every tab is an HTML file or raster image.

## What is available

| Workspace | Model context | Native tools | Acceptance |
| --- | --- | --- | --- |
| Code | Active source and selected range or element | Existing source/DOM tools | One complete source transaction; explicit save |
| Photos, raster | Dimensions and non-destructive operations | Existing raster tools with rendered before/after previews | Raster host history; explicit save-copy |
| Photos, Develop | Dimensions, exposure, contrast, saturation | `photo_inspect`, `photo_propose_settings` | Reviewed settings transaction; Develop history; explicit export |
| Sound | Clip metadata, settings, effect ranges, render statistics | `sound_inspect`, `sound_propose_settings` | Reviewed settings transaction; guarded undo; explicit save-copy |
| Slides | Canonical slide text, dimensions, layouts and notes | `deck_inspect`, `deck_propose_changes` | Text-run changes only; awaited session apply and guarded undo; explicit save-copy |
| Documents | Loaded DOCX paragraph text and block/page metadata | `studio_inspect` | Read-only AI context |
| Sheets | Selected cell, formula, address and sheet name | `studio_inspect` | Read-only AI context; not the full workbook |
| Video | Track metadata, timeline clips and export format | `studio_inspect` | Read-only AI context; no media bytes |
| Vector | Open SVG source | `studio_inspect` | Read-only AI context |
| Empty studio | User prompt only | None | General guidance; no document access or edits |

These are implemented capabilities, not promises of unsupported media editing.
PDF binary extraction, arbitrary office layouts, image generation, audio/video
understanding and AI-driven export are not provided by this change. Noncanonical
PPTX decks remain preview-only. A still-loading or unsupported document fails
without substituting another tab's context.

## Shared boundary

`studioWorkspace.ts` reads live editor/session stores and produces a text catalog
with explicit adapter, resource identity and revision bindings. Resource URLs
are identity tokens inside the host catalog only. They are not part of model
context. A replacement of a same-named asset or a switch between Develop and
Raster creates a new registry identity. Manual edit/revert invalidates stale
proposals rather than authorizing an overwrite merely because the text matches.

`panelBridge.ts` pins one registry identity/revision before approvals. It grants
inspection only for that document, checks cloud disclosure separately, and sends
its bounded context as untrusted data. Each provider round rechecks the pinned
revision. Tools cannot redirect to another document, execute a shell, save,
export or fall back to generic `write_file`.

Existing Sound, Slides and Develop adapters use synchronous staging callbacks.
The bridge transfers their staged result into `AgentProjectTools`, so the same
session completion rules publish proposals only after a complete turn. Failure
or cancellation discards staged data. Read-only studios expose no proposal tool.

`TransactionManager` awaits asynchronous apply and undo before marking a
transaction accepted or undone. Collaboration guests cannot accept or undo.
The Code adapter holds autosave before applying. Media adapters change session
memory only and retain their original save-copy/export behavior. A failed undo
stays accepted and cannot overwrite later manual edits. Sound now checks source
identity and settings revision, including edit/revert cycles.

## Sidebar behavior

Studio-specific suggestions fill the input only. They do not start inference or
execute tools. The context chip names the active workspace and its actual
context shape. In the legacy Code canvas an active media preview takes precedence
over a retained source tab, matching the canvas. Specialized studio canvases use
only their matching media. No matching document means a prompt-only session.
Switching workspace clears the per-run cloud disclosure checkbox.

## Validation

- TypeScript check with the fresh-clone missing Slides bridge declaration supplied
  locally for validation only; no generated bridge or engine stub is shipped.
- Agent unit suite, including routing, explicit same-kind adapters, identity and
  revision conflicts, read-only tool boundaries, async apply/undo and Sound
  proposal propagation.
- Existing Agent panel browser regressions: source preview/accept/undo, access
  decline, streaming/stop, provider consent and settings persistence.
- New browser fixtures: empty Video/Sound guidance with no document tools; actual
  panel-to-Sound-session proposal, review, accept and undo with a fixture engine
  and fixture local provider. No paid inference is used.
- Sidebar and Sound-review screenshots inspected for readability and correct
  context/copy.

The fresh clone does not contain generated WASM bridges. A production bundle,
real media-engine integration and Windows/macOS behavior must be validated by the
integration build. Fixture tests are not claims of native-engine validation.
