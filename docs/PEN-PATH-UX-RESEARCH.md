# Pen and path editing UX research

Date: 2026-10-07. Scope: Illustrator, Figma, Inkscape and Penpot for Somnia. Documentation/source review, not hands-on testing. All Somnia interactions below are proposals, not shipped features.

## Recommendation

Start SVG-path-first: separate object selection, node editing and Pen drawing; expose Corner, Smooth and Symmetric constraints; preserve draft geometry and intentional undo. Borrow Illustrator's tool distinction, Figma's contextual toolbar, Inkscape's node vocabulary and Penpot's state-aware finish/cancel. Build editable Boolean groups before destructive region-based Shape Builder. Defer arbitrary vector networks and auto-smooth until their model/export implications are settled.

| Priority | Scope | Gate |
| --- | --- | --- |
| 1 | Pen, node selection, handles, close/continue, undo | Geometry round-trip and gesture cancellation |
| 2 | Join/break, compound paths, coordinates, Layers | Topology, transforms, stable selection IDs |
| 3 | Boolean groups, then Shape Builder | Intersection engine, styles, fill rules, accurate preview |
| Defer | Branching networks, auto-smooth, variable width | Separate product and serialization decision |

Criteria: editable SVG outside Somnia, a small contextual UI, keyboard alternatives, no hidden destructive conversion. Evidence covers official documentation, first-party engineering/source, release notes and an archived community tutorial. Independent usability evidence is limited.

## Reference interactions

### Illustrator

- Selection V targets objects; Direct Selection A targets anchors; Pen P draws; Anchor Point Shift+C converts. Add/delete anchor tools use + / -; Shape Builder Shift+M. [A4]
- Click creates line anchors, click-drag creates handles, Shift-click constrains to 45 degrees. Clicking the first hollow anchor closes; Ctrl/Command-click away leaves the path open. [A1]
- Corner-to-smooth drags out handles. Smooth-to-corner may remove handles or retain independent handles. Alt/Option-drag adjusts one side. Conversion buttons also exist. Corner therefore does not mean 'no handles'. [A2]
- Shape Builder operates on selected paths. Drag merges; Alt/Option erases regions/edges; Shift-click-drag uses a rectangular marquee. Style inherits drag-start object, then release object if unavailable, then topmost selected object if neither has a style. [A3]
- Layers separates visibility, editability, appearance targeting and selection. Copying its four columns without an appearance model would add confusion. [A5]

Transfer: distinguish object/node intent, corner-with-handles versus remove-handles, selected-input scope and visible modifier feedback.

### Figma

- Pen P click-adds points; click-drag creates curves. Hover another point to close shows a circle; Escape leaves an open path. Vector networks can branch rather than forming only a directed chain. [F1,F5]
- Enter edits one or more vector layers. Secondary toolbar includes Bend, Cut, Lasso, Paint, Shape Builder, Eraser and Variable Width. V moves points; P adds; Shift-click includes another layer; Ctrl/Command-click switches layers. [F2]
- Bend adds handles at points/paths. Mirroring explicitly distinguishes independent handles, angle-only mirroring and angle-plus-length mirroring. Multi-point bounding boxes support Shift proportional resize, Alt/Option center resize, Shift 15-degree rotation and temporary Space repositioning. [F2]
- Paint targets closed regions with striped hover plus add/remove cues. Erasing across a vector does not automatically split it into separate layers; Split vector is separate. [F2]
- Figma now has native Shape Builder, not merely a plugin: enter vector mode, drag to merge, click to extract a region to a layer, Alt/Option-click to subtract. Official docs call it destructive, unlike Boolean operations. [F4]
- Enter/double-click descends groups, Shift+Enter selects parent, Tab/Shift+Tab siblings; Ctrl/Command deep-selects. Right-click Select layer lists overlap in Layers order. Hidden layers are absent; locked layers appear with a lock and can be selected there. [F3]

Transfer: contextual mode tools, mirroring controls and named overlap selection. Do not adopt degree>2 graph vertices by default: SVG export needs a deliberate policy.

### Inkscape

- Pen is B or Shift+F6, not P (P is Pencil). Click makes cusp nodes; drag makes smooth collinear handles. Ctrl constrains to 15 degrees; Shift during handle drawing decouples. Enter finalizes; Escape cancels an unfinished line; Backspace removes its last segment. End anchors permit continuation/closing. [I1,I3]
- Node tool supports node, handle and segment dragging. Segment click selects adjacent nodes; Shift-click toggles; marquee groups nodes. Double-click or Ctrl+Alt-click inserts a node. [I3]
- Cusp: independent handles. Smooth: collinear, independent lengths. Symmetric: collinear, equal lengths. Auto-smooth: computed handles adapt when nodes move. Glyphs expose types. [I2]
- Shift+C/S/Y/A converts to cusp/smooth/symmetric/auto-smooth. Hover one handle during conversion to preserve it. Shift+B breaks selected nodes; Shift+J joins two endpoints. Delete tries to retain shape except at sharp corners; Ctrl+Delete always tries. This is approximation, not identical geometry. [I3]
- Combine Ctrl+K creates a compound path, not Union; Ctrl+Shift+K breaks apart. Shared style comes from lowest-z input. Object-to-path loses shape-specific editing. [I3]
- Shape Builder X stages a result. Select overlapping objects or a self-intersecting path; outlines isolate inputs. Click adds, drag unions, Shift subtracts. Escape cancels; Enter/button/tool switch accepts. Untouched regions are discarded. Blue/pink show modes. [I4]
- 1.3 release notes warn of excessive nodes on some curved results. Historical evidence only, not a verified current bug. Layers supports eye/lock swipe, multi-selection toggles, name search, opacity/blend popover and keyboard navigation: Space confirms; Shift+Left/Right expands/collapses; Shift+Up/Down changes stacking. [I4]

Transfer: precise constraint vocabulary, reference-handle preservation, compound-path distinction, staged construction. Do not silently inherit 'untouched = discarded'.

### Penpot

- Path P click creates corner, drag creates curve. Start-node click closes; Escape/Enter stops drawing, another Escape exits edit mode. Shift constrains to 45 degrees. Double-click/Enter edits nodes; public guide offers corner/curve controls. [P1]
- Scoped path shortcuts: M move, P draw, J join, Ctrl/Command+J merge, K separate, X corner, C curve, Delete remove, Shift+plus add, Ctrl/Command+apostrophe snap. C means Comments outside path editing. [P2,P4]
- Union/difference/intersection/exclusion preserve children in editable groups. Flatten permanently combines paths and is explicitly not a true Boolean operation. No native region-brushing Shape Builder was verified in reviewed docs. [P1]
- Ctrl/Command-click bypasses groups; double-click descends. Locked layers cannot be directly edited on canvas, but their properties can still be changed through Layers selection. [P1]

Transfer: scoped state/keys and editable Boolean children. Lock semantics are a product decision, not universal.

## Proposed Somnia contract

### Drawing and recovery

| State | Gesture | Effect | Recovery |
| --- | --- | --- | --- |
| Object mode | P | Arm Pen, no object yet | Escape returns to previous tool |
| Armed | Click empty | One-node draft | Never save an invisible single-node artifact implicitly |
| Drawing | Click / drag | Commit corner / node plus handle gesture | One undo step per intentional gesture |
| Drawing | Escape during drag | Restore pre-gesture geometry | Preserve earlier committed draft segments |
| Drawing | Hover/click first endpoint | Close ring then close subpath | No duplicate node; undo reopens |
| Drawing | Enter or idle Escape | Finish valid open path, stay in node mode | Second Escape exits node mode |
| Node mode | Pen-click endpoint | Continue eligible subpath | Reverse direction without changing existing curves |
| Node mode | Double-click segment | Subdivide at projected curve location | Preserve curve, IDs and selection |

Escape differs across references: Figma preserves an open path, Inkscape cancels unfinished drawing, Penpot dispatches by state. Proposed Somnia preserves committed draft segments and cancels only the active gesture; a separate Cancel path discards the draft. Document/tool switches must resolve the draft explicitly.

### Handles and selection

- Separate object selection from typed node/segment/handle selection. Empty node selection must never fall through to whole-object Delete.
- Corner means independent handles; Smooth means collinear with unequal lengths allowed; Symmetric means collinear and equal length. Remove handles is separate. Smooth is tangent continuity, not equal curvature.
- Node movement translates its handles. Handle movement obeys stored constraints. Alt/Option temporarily decouples with a visible cue; decide whether release permanently switches to Corner.
- Conversion preserves the last manipulated handle, with a deterministic fallback, rather than rotating both unpredictably. Inkscape and Penpot support this preservation concept. [I3,P7]
- Inspector: exact local X/Y, type, Join, Merge, Break. Mixed types display Mixed. Join adds a segment between eligible endpoints; Merge combines positions/topology; Break opens a path. Disable unsupported combinations with a reason.
- Shift-click/marquee toggles/adds nodes. Show selected handles clearly; selection needs shape/stroke/tooltip signals beyond color. Segment dragging can follow later with an explicit endpoint/handle rule.

### Booleans and Shape Builder

- Preserve Boolean children and operation; Flatten is explicit. Entering node mode must not silently flatten.
- Shape Builder works only on selected eligible inputs. Show candidate boundaries and patterned hover. Dim unrelated artwork without changing document visibility.
- Persistent Merge / Extract / Subtract controls; Alt/Option is only a temporary override, not the sole accessible subtract route.
- Stage output; Escape cancels current stroke, Cancel discards session, Apply records one transaction. Preserve untouched regions by default; Keep only selected regions is separate.
- Define output style/z-position. Suggested style: first touched eligible region; retain original inputs until Apply. Avoid drag-direction-dependent changes.
- Open paths are not closed fill regions. Decide whether they are cutters; do not invent closure or expand strokes silently.
- Never simplify generated curves automatically. Explicit Simplify needs tolerance and preview; diagnostics belong in Problems/context UI.

### Layers and focus

One SVG object maps to a row; compound subpaths remain geometry inside it. Boolean groups expose source rows; extraction creates a row. Preserve IDs/names, parent transforms and viewBox coordinates. Reveal selected rows without resetting nodes or unnecessarily opening groups. Provide Select under cursor. Proposed lock is stricter than Penpot: inspection allowed, mutation requires explicit unlock. Enter descends groups or edits an eligible path; Escape backs out one level. Tab cycles nodes only when canvas owns focus, never trapping sidebar/dialog navigation.

## Shortcuts and collision rules

| Intent | Illustrator | Figma | Inkscape | Penpot | Somnia proposal |
| --- | --- | --- | --- | --- | --- |
| Pen | P | P | B / Shift+F6 | P | P |
| Node edit | A | Enter | N / F2 | Enter | A or Enter |
| Finish open | Ctrl/Command-click away | Escape | Enter | Enter/Escape | Enter, state-aware Escape |
| Type conversion | Shift+C tool | Mirroring controls | Shift+C/S/Y/A | X/C scoped | Named actions first |
| Shape Builder | Shift+M | Context toolbar | X | Not verified | Shift+M after audit |
| Draw angle | Shift 45 degrees | Not verified here | Ctrl 15 degrees | Shift 45 degrees | Shift 45 degrees |

Sources [A1,A2,A4,F1,F2,I1,I3,I5,P1,P2]. Audit existing bindings. German punctuation layouts, IME, browser/native interception and focus need tests. Suppress letter shortcuts in code/text fields. Every command needs a visible alternative. Not verified means not checked, not absent.

## Edge cases and follow-up tests

| Case | Acceptance criterion |
| --- | --- |
| Collapsed handle / zero-length segment | No NaN, editable node, defined missing-tangent rule |
| Close curve / reverse continuation | Correct incoming/outgoing handles; no shape change or duplicate anchor |
| Insert at endpoint / crossing / transformed curve | Correct displayed segment, stable projection, shape-preserving subdivision |
| Mixed constraints / selected locked parent | Atomic eligible edits; accurate Mixed state; no hidden mutation |
| Delete node / segment / handle | Heal / open / collapse distinct; endpoints and final node covered |
| Compound holes / self-intersections | Preserve fill rule and subpaths on save/export |
| Tangent regions / coincident edges / slivers | Stable hit-test and result; no silent cleanup |
| Gradients / strokes / masks / clips | Preserve references or reject unsupported input explicitly |
| SVG arcs / quadratics / relative commands | Preserve or document deliberate cubic conversion |
| Nonuniform transforms / nested viewBox | Local-space editing and screen-space hit radii |
| Zoom 10% / 400%, touch/stylus | Clear target priority, usable targets, no assumed pressure behavior |
| Escape / blur / lost capture / document switch | Snapshot restore; no stuck drag or duplicate commit |
| Undo / redo / save / reload | Geometry, topology, selection and Layers restore together; previews not history |
| Keyboard / contrast | Named type controls, coordinates, focus recovery, non-color selection |

Future geometry/reducer tests should use node:test and the existing phase1 test:core glob (currently tsx --test). Fixtures: open/closed cubic, mixed handles, fill-rule holes, endpoint merge, transforms, one-node draft, coincident regions, history and ID remap. No tests implemented/run here. Gesture, visual and accessibility checks remain necessary; unit tests alone do not establish UX readiness.

## Penpot technical reuse and licensing

Inspected develop snapshot cb1118f9045c83784008e2d8ae112abbb3f99320, not a release. Path frontend is ClojureScript; shared geometry uses Clojure/ClojureScript. Repository contains other languages too. [P3-P7]

| Source | Observation | Transfer |
| --- | --- | --- |
| state.cljs | Drawing ID preferred, edition ID fallback; selection keyed by path | Separate draft, object and mode identity [P5] |
| shortcuts.cljs | Scoped overrides; pending initial draw finishes, pending existing segment cancels, otherwise interrupts; Enter shares dispatcher | State-aware keys, no competing global Enter handlers [P4] |
| undo.cljs | Preview omitted, selection remapped, node+handle history merge | Intent-level history, not pointer preview [P6] |
| tools.cljs | Reference-handle constraints, selection/type remap; deletion prioritizes nodes then segments then handles | Explicit selection types and deterministic topology mapping [P7] |

Source-level details may differ from released UI; no live app test performed. Recommend independent TypeScript concepts, not a direct port or its reactive framework. No snippets, files, translated code, assets or dependencies imported.

MPL-2.0 is not MIT. Penpot headers/LICENSE state MPL. Mozilla explains covered files/modifications retain obligations; new files containing no MPL code need not be MPL even in a larger work. Distribution brings source-availability and notice requirements. Copying or translating code needs file-level provenance/license review and a distribution plan, not MIT relabeling. Practical caution, not legal advice. [P3-P7,L1]

## Open decisions

- Path chains versus branching graph and export policy; recommend chains/compound paths first.
- Handle decoupling persistence, delete-heal tolerance, merge position and join eligibility.
- Boolean engine and curve-intersection strategy: no benchmark or dependency recommendation performed.
- Shape Builder open cutters, untouched regions, styles, strokes, clips and masks.
- Dedicated SVG editor versus arbitrary page DOM; save/focus/selection implications.
- Shortcut conflicts and metadata survival after external SVG editing; geometry alone cannot always recover intended node constraints.
- No hands-on comparison, visual UI audit, latest Inkscape bug retest or quantified usability study. All acceptance scenarios are future work, not passing results.

## Sources

Accessed 2026-10-07; bodies read, not only search snippets. High confidence for documented behavior, limited for runtime/performance. Undated entries exposed no date used here. Pinned GitHub pages were fetched and corresponding files inspected locally.

- [A1] Adobe Pen help, updated 2024-07-17: https://helpx.adobe.com/illustrator/using/tool-techniques/pen-tool.html
- [A2] Adobe anchor conversion, 2025-10-27: https://helpx.adobe.com/illustrator/desktop/draw-shapes-and-paths/modify-paths/convert-anchor-points-on-a-path.html
- [A3] Adobe Shape Builder, 2024-07-17: https://helpx.adobe.com/illustrator/using/creating-shapes-shape-builder-tool.html
- [A4] Adobe shortcuts, 2026-02-17: https://helpx.adobe.com/illustrator/using/default-keyboard-shortcuts.html
- [A5] Adobe Layers overview, undated here: https://helpx.adobe.com/in/illustrator/desktop/manage-layers/create-and-organize-layers/layers-overview.html
- [F1] Figma vector networks help, undated: https://help.figma.com/hc/en-us/articles/360040450213-Vector-networks
- [F2] Figma vector editing help, undated: https://help.figma.com/hc/en-us/articles/360039957634-Edit-vector-layers
- [F3] Figma selection help, undated: https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects
- [F4] Figma native Shape Builder help, undated: https://help.figma.com/hc/en-us/articles/31616004109847-Create-custom-shapes-with-the-shape-builder-tool
- [F5] Figma engineering/design blog, historical 2016-02-09: https://www.figma.com/blog/introducing-vector-networks/
- [I1] Inkscape Beginners' Guide Pen tutorial, undated: https://inkscape-manuals.readthedocs.io/en/latest/pen-tool.html
- [I2] Inkscape Beginners' Guide node types, undated: https://inkscape-manuals.readthedocs.io/en/latest/node-types.html
- [I3] Inkscape official advanced tutorial, undated: https://www.inkscape.org/doc/tutorials/advanced/tutorial-advanced.html
- [I4] Inkscape version-specific 1.3 release notes: https://inkscape.org/doc/release_notes/1.3/Inkscape_1.3.html
- [I5] Archived FLOSS Manuals Node Tool, historical selection corroboration only: https://archive.flossmanuals.net/inkscape/toolbox/node-tool.html
- [P1] Penpot Layers help, undated: https://help.penpot.app/user-guide/designing/layers/
- [P2] Penpot shortcut reference, undated: https://help.penpot.app/user-guide/first-steps/shortcuts/
- [P3] Penpot repository, license and language inspection: https://github.com/penpot/penpot
- [P4] Pinned source: https://github.com/penpot/penpot/blob/cb1118f9045c83784008e2d8ae112abbb3f99320/frontend/src/app/main/data/workspace/path/shortcuts.cljs
- [P5] Pinned source: https://github.com/penpot/penpot/blob/cb1118f9045c83784008e2d8ae112abbb3f99320/frontend/src/app/main/data/workspace/path/state.cljs
- [P6] Pinned source: https://github.com/penpot/penpot/blob/cb1118f9045c83784008e2d8ae112abbb3f99320/frontend/src/app/main/data/workspace/path/undo.cljs
- [P7] Pinned source: https://github.com/penpot/penpot/blob/cb1118f9045c83784008e2d8ae112abbb3f99320/frontend/src/app/main/data/workspace/path/tools.cljs
- [L1] Mozilla license FAQ, primary guidance sections Q8-Q12: https://www.mozilla.org/en-US/MPL/2.0/FAQ/
