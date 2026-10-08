# Context and awareness

[Overview](README.md) / Context and awareness / [Studio direction](studio-direction.md)

## 1. Three separate concepts

- **Context-sensitive UI:** active document, object, editor, representation and available services.
- **Collaboration awareness:** presence, cursors and activity received from remote participants.
- **Agent context:** content deliberately supplied to a provider and reviewed edits returned from it.

They can appear together but do not share an authority model. A cursor does not authorize a write. A selection does not authorize an upload. An enabled tool is not a commitment to run it.

## 2. Context inputs in the baseline

| Input | Source | UI effect |
| --- | --- | --- |
| Active text file | `appStore.activeFile`, file map | Language, source, Markdown/SVG/TeX routing |
| Active binary media | `media.active`, sniffed kind | Raster/media/PDF route and side panels |
| Active raster editor | RasterEditorProvider | Canvas ownership, header controls, scoped commands |
| Selected nodes | Stable IDs and core tree | Inspector, metrics, applicable actions |
| Representation | design/code/split, diff, livePreview | Content views, not separate documents |
| Responsive scope | Explicit scope or viewport | Target breakpoint for style transactions |
| Core/service state | coreConnected, adapters | Availability predicates |
| Editor state | Busy/history/dirty | Save, undo, close and edit gates |
| Extension panel | activePanel, registry | Side slot where media has not superseded it |
| Appearance/platform | Preferences, media queries, native result | Theme, motion, contrast and glass |
| Chat session | Collaboration runtime | Chat and unread/status state |

These are distributed source facts, not a single exported context-resolver API.

## 3. Main-editor routing precedence

[`Canvas.tsx`](../../../phase1/src/components/Canvas.tsx) implements:

```text
raster.active? -> RasterEditor
active media? -> MediaViewer (including inline PDF/PSD route)
no text core? -> EmptyState
otherwise:
  source visible? -> SourceEditor or DiffSplit
  design visible?
    SVG -> SvgEditor
    Markdown/TeX -> RenderedPreview
    livePreview -> LivePreview
    otherwise -> DesignCanvas
```

An active media tab takes precedence over the old text `activeFile`. Markdown context is only active without media. `designFile` can retain the HTML canvas document independently of the currently active source.

App side-slot precedence is separate:

- Left: raster, PDF, extension panel, regular LayersPanel router.
- Right: raster, PDF, extension panel, Inspector router.
- Markdown without raster or a right extension hides the inspector but retains its open preference.
- Inspector routes SVG properties only for connected SVG source, no media and non-code representation.

These trees are not the planned unified Studio registry. They can create mismatches between generic rail labels and mode-specific slot content; [verification](verification.md) records that gap.

## 4. Commands as a context boundary

The registry contains stable ID, category, title, optional shortcut/keywords/input allowance, optional enabled predicate and execution handler. Menus and palette use `listCommands`; execution checks availability again.

`registerCommandScope` lets an active editor resolve a shared ID. The most recently registered resolver that returns a command wins. Its cleanup restores underlying registrations. Raster uses this for Save/Undo/Redo/Close. PDF has its own command IDs and keyboard listener in the baseline. Do not call that a fully unified document-command port.

Successful execution stores five recent IDs. The palette's empty query ranks by recency, and search ranks by match score. Thus "no adaptive reordering" applies to stable spatial anchors, not palette search results. Core rail/menu order does not reorder from predicted intent; extension entries can change their own group.

**Design requirement:** toolbar, menu, palette and shortcut availability must agree. Scope cleanup must follow active document lifecycle. Late async completion must not update another document after a tab switch or source replacement. A disabled button is not enough if a command path bypasses the gate.

## 5. Selection and responsive awareness

HTML core uses node IDs; refresh removes selected IDs no longer in the tree. Inspector fields follow the current node's attributes. Layer/canvas menus target the clicked node. Explicit breakpoint scope wins over viewport-derived mapping for responsive style edits.

Raster, SVG and PDF have different selection models. A pixel selection is not a DOM node. Multiple selection is not automatically one representative object's properties.

| Context state | Design requirement |
| --- | --- |
| No document | Useful empty state; no mutation |
| No selection | Document properties or explicit empty properties state |
| One valid selection | Applicable controls and clear target |
| Several selections | Honest mixed values and explicit multi-edit scope |
| Locked/unsupported object | Inspect/copy where safe; relevant mutation disabled |
| Busy operation | Prevent conflicts; preserve supported cancel |
| Source/selection replaced | Re-resolve or clear; reject stale completion |
| Active editor changed | Correct history/save/close owner |

These are review requirements; each format still needs its own evidence.

## 6. Recognition is not fidelity

[`media.ts`](../../../phase1/src/lib/media.ts) recognizes PNG, JPEG, WebP, PDF and PSD v1 signatures and caps binary media at 25,000,000 bytes. PSD signature recognition does not establish full layer import/export fidelity. Source Markdown/SVG/TeX routing uses suffix helpers.

The concept additionally lists GIF/BMP and a common detection path. Those are planned, not extra support established by the current binary importer. Unknown media produces an explicit error instead of entering a misleading mode.

## 7. Remote awareness is untrusted data

[`awarenessSafe.ts`](../../../phase1/src/lib/collab/awarenessSafe.ts) sanitizes remote states before UI/cursor consumption:

- Names use `cleanDisplayName`; non-string names become Guest.
- Colors accept constrained six-digit hex or a bounded fallback.
- Optional participant IDs accept a constrained alphanumeric/underscore/hyphen shape.
- Remote cursor positions require valid relative-position objects; file filtering excludes a cursor for another file.
- The proxy returns sanitized remote state while forwarding local writes.
- Cursor-rendering colors use session-stable palette tokens rather than arbitrary incoming CSS.

Names, messages, paths and peer payloads are data, not app commands. Do not inject them into CSS, HTML or command IDs. Presence does not prove editing permission, sync completion, identity assurance or disk save.

### Participant visual policy

[`badgePolicy.ts`](../../../phase1/src/lib/collab/badgePolicy.ts) maps participant identity to eight palette indices with separate light/dark shades. Repeated colors are possible; names/initials retain meaning.

Badge modes are activity, always and never. Active/hover is opacity 1. Idle begins after 4,000 ms; always fades to 0.55, activity hides and never stays hidden. Preference key: `somnia.collab.badges.v1`. This is presence display, not adaptive tool selection.

Session, chat, encryption and transfer details stay in [collaboration.md](../../collaboration.md). Awareness transport does not authorize effects.

## 8. Agent context stays separate

Provider configuration belongs to Settings. Tool approval and edit review belong to the Agent flow. Selecting an object can make it easier to reference, but cannot silently widen provider disclosure to the whole project or bypass edit review.

Follow [Agent documentation](../../agent/README.md) for provider/privacy/tool boundaries. Model output is not an accepted change. An accepted change is not a successful disk save. The active editor retains history and dirty-state ownership.

## 9. Stable spatial adaptation

The Studio design requirement is stable shell anchors, predictable slot changes, contextual property sections, discoverable unavailable reasons and no toolbar reshuffling from predicted intent. Existing code is narrower: raster removes header controls, Markdown hides some web controls, side slots switch content, palette ranking changes with recency/search.

That is the distinction between the implemented context-sensitive UI and the complete capabilities/selection/permission resolver still under construction. See [Studio direction](studio-direction.md).
