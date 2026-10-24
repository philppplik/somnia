# Studio tool roadmaps: Adobe references and two-sided workspaces

Status: proposed concepts only; awaiting Philipp's review. No implementation, push or release approval is recorded here.
Date: 2026-10-14. Baseline: `int/shell` at `09498bbb16cdc1d4dd901b9cbfc198d688ebbf20`.
Companion: [Two useful sides for dense studios](studio-shell-dual-inspectors.md), covering shared APIs, state migration, responsive layout and tests.

## 1. Recommendation and evidence

Start with Photos: Presets/History left, adjustments right. Vector and Video follow. Documents, Slides, Sound and Design benefit from navigation/structure left and properties right, without two copies of an inspector. Sheets needs one formula editor and enough grid width. Vibe Space needs selected-run context, not creative tools.

Priority order: P0 shared shell/state and Photos pilot; P1 bounded tools over existing operations; P2 document/geometry/processing model additions. Choose packages separately, not all ten studios at once.

Current tools below are a source-code inventory of the baseline, not Windows runtime certification or a claim about released builds. Paths are under `phase1/src/`. Adobe sources A1-A13 were fetched/read on 2026-10-14. Vendor documentation is appropriate for Adobe's own tool inventory; no independent usability ranking or performance claim is made.

Matrix status: **Have** = comparable source operation, possibly narrower; **Direct candidate** = bounded work over an existing model, subject to a feasibility check; **Expensive** = new engine/model/fidelity/security work; **Not a goal** = outside this proposal; **Unverified** = inspected paths do not establish support, not proof of global absence. Priorities and difficulty are engineering judgments, not Adobe facts or delivery estimates.

Implement behaviour independently. Do not copy Adobe source, icons, assets, branding or proprietary presets. Documentation is not an asset licence; specialized algorithms may need separate legal/licensing review. Every accepted tool needs a command, selection/data model, undo contract, export behaviour and tests. A stub button is not a tool.

## 2. Code Studio: Dreamweaver

Current: `lib/studios/code.ts`, `studios/codeRail.ts`, `codePanels/shell.ts`, `components/studios/code/registerShell.ts`: visual/code/split, Layers, Files, Search, Components, CSS, Versions, Responsive, Outline; Design/Interactions/Source sections; live preview; format/wrap/unwrap, duplicate/delete, entities, HTML/table/Markdown insert commands. `lib/editorPrefs.ts` exposes completion/Emmet settings, not proof of every runtime extension.

Two-side concept: keep familiar structure/tools left and element properties right. Inline help is preferable to another permanent panel. Preserve Code single-panel rendering and visual baselines.

| Adobe tool | Status / Somnia mapping | Next step |
| --- | --- | --- |
| Insert panel, Wrap Tag [A1] | Have: insert/components and wrap commands | P1 discoverability/keyboard review; no duplicate insertion panel. |
| Code hints, Emmet [A1] | Preferences/dependencies present; runtime parity unverified | Verify actual editor wiring before adding anything. |
| CSS Quick Docs/Quick Edit [A1] | CSS panel present; inline help parity unverified | Direct candidate: bounded local CSS help; cross-file inline editing separate. |
| Multiple cursors [A1] | Runtime parity unverified here | Verify CodeMirror configuration first. |
| JS rename/extract function [A1] | No equivalent established by inspected commands | Expensive: semantic language service and safe project-wide edits. |

First package: contextual CSS help plus existing-feature verification. Gate: no second editor/inspector or Code layout regression.

## 3. Documents Studio: InDesign interaction reference, Acrobat boundary

Current: `lib/studios/documents.ts`, `lib/documents/{panels,edit,panelCommands}.ts`, `components/documents/registerShell.ts`: DOCX pages/outline, literal find/replace on editable paragraphs, text editing, navigation, undo/redo, zoom, copy export and compatibility risks. Table/object paragraphs are excluded from panel find/replace. PDF is a separate App/session path, not the DOCX manifest.

Two-side concept: Pages/Outline/Find left; one paragraph/document inspector right. Prefer Pages/Outline over Files for a fresh workspace.

| Adobe tool | Status / Somnia mapping | Next step |
| --- | --- | --- |
| Type in a frame [A10] | Have narrowly: paragraph text, not arbitrary frames | Direct candidate: selected-paragraph reveal and statistics using existing helpers. |
| Move/resize text frame [A10] | DOCX paragraph editing does not establish frame geometry | Expensive: anchored objects, constraints and round-trip fidelity. |
| Named panel workspace [A9] | Have per-studio state; named presets unverified | Direct candidate: navigation-first layout/reset preset. |
| Change PDF text [A11] | Not established by Documents manifest | Inventory PDF engine separately, do not promise parity. |
| Secure PDF redaction [A12] | No security guarantee verified | Expensive; not a shell goal. A black rectangle is not redaction. |

First package: better navigation and a single editing surface. Gate: edit/undo/save without damaging untouched DOCX content or editing excluded table matches.

## 4. Sheets Studio: no direct Adobe spreadsheet counterpart established

Current: `lib/studios/sheetsRail.ts`, `lib/sheets/{panels,commands,panelController}.ts`, `components/sheets/registerShell.ts`: workbook navigation, values/formulas, range analysis, formula builder, undo/redo, save-copy; shared Files/Search/Versions. The inspected shell explicitly avoids formatting commands because this path writes values/formulas.

Two-side concept: Workbook/Analysis left, Cell and one Formula builder right. Current formula panel plus collapsed inspector section should share one editor with a summary/reveal action. Keep the grid large.

| Adobe reference | Status / Somnia mapping | Next step |
| --- | --- | --- |
| No direct counterpart in the fetched docs | Not applicable | Do not equate InDesign tables with a spreadsheet engine. |
| Panel workspace [A9], analogy only | Have per-studio layout | Direct candidate: analysis/navigation preset. |
| Creative-editor text frame controls [A10], analogy only | Not spreadsheet formatting evidence | Do not infer XLSX styles, charts or conditional-format support. |

First package: one formula editor and clear range facts. Later formatting, sorting/filtering and charts need engine/round-trip tests before classification as direct candidates. Gate: opening panels never commits a formula draft; formulas/undo round-trip in XLSX.

## 5. Slides Studio: Adobe Express

Current: `lib/slides/{shellRail,panelDefinitions,commands,panelCommands}.ts`, `components/slides/registerShell.ts`: thumbnails, text outline, slide/text selection, text edit undo/redo, copy export, compatibility diagnostics, present/from-start/exit commands. Full structural deck editing is not established by these commands.

Two-side concept: Slides/Outline left; text/presentation/compatibility right. Fullscreen presentation is separate from editing.

| Adobe tool | Status / Somnia mapping | Next step |
| --- | --- | --- |
| Fullscreen present [A8] | Have presentation commands | P1 keyboard/focus verification. |
| Duplicate/skip page [A7] | Structural mutation API unverified | Expensive until PPTX relationships and export are supported; not thumbnail copying. |
| Notes/separate presenter window [A7,A8] | Unverified | Direct candidate: explicitly session-only notes; persistent PPTX notes and synchronized second window need separate fidelity work. |
| Transitions [A7] | Unverified | Expensive for import/edit/export parity; label preview-only effects honestly. |

First package: presentation ergonomics, session notes only if wanted. Gate: never imply session notes are saved in PPTX; preserve original deck content.

## 6. Sound Studio: Audition

Current: `lib/studios/sound.ts`, `lib/sound/{commands,steps}.ts`, `components/sound/{SoundPanels,SoundInspector}.tsx`: clips, region crop/cut/only, silence trim, reverse, pitch, one effect configuration, fades, normalization, source/level facts, original/processed listening and export. Multiple loaded clips do not establish a multitrack mixer.

Two-side concept: Clips/Selection left; Levels/Effects/Processing right; waveform/transport central.

| Adobe tool | Status / Somnia mapping | Next step |
| --- | --- | --- |
| Rack input/output/dry-wet controls [A6] | Processing and peak/RMS facts present; routing unverified | Direct candidate: clearer existing process summary. New gain/mix DSP needs separate verification. |
| Effect presets [A6] | Serializable settings exist; preset UI unverified | Direct candidate: validated user-owned recipes over supported parameters. |
| Reorder/bypass up to 16 effects [A6] | Current schema has one effect | Expensive: effect-chain model, buffers, order and undo. |
| Per-clip/per-track multitrack racks [A6] | Track/mixer model unverified | Expensive; outside panel migration. |

First package: processing recipes and before/after comparison. Gate: no destructive original changes; export matches preview processing.

## 7. Video Studio: Premiere

Current: `lib/studios/video.ts`, `lib/video/timeline.ts`, `components/video/{registerShell.ts,VideoPanels.tsx}`: Sources/Sequence, gap-free ordered clips, split/trim/move/delete, title cards, gain/mute/crossfade, source facts, preview/export. Not a general multitrack model.

Two-side concept: Sources/Sequence left; Clip/Audio/Export right. Timeline stays below preview in the workspace, not a narrow sidebar.

| Adobe tool | Status / Somnia mapping | Next step |
| --- | --- | --- |
| Selection/Razor [A5] | Have select/move/split | Direct candidate: Razor tool/shortcut over existing split and undo. |
| Ripple Edit [A5] | Have narrow ripple-like result: gap-free ranges recompute after trim | Direct candidate: explicit trim preview/labels, not Premiere parity. |
| Slip [A5] | Source in/out/duration represented | Direct candidate: shift both bounds preserving duration, clamp to source; test fades/audio/titles. |
| Pen/keyframes [A5] | Keyframe model unverified | Expensive: interpolation, compositing and export support. |
| Generative Extend [A5] | No assigned equivalent | Not a goal; separate model/service/cost/rights decision. |

First package: Razor and bounded Slip. Gate: deterministic source-time mapping and preview/export agreement; Slip preserves duration.

## 8. Design Studio: InDesign frames and Illustrator artboards

Current: `lib/studios/design.ts`, `components/design/{DesignShellPanels,DesignInspectorPanel}.tsx`, `lib/design/artboards.ts`: artboards/presets, layers/rename/order/visibility/lock, colors, select/hand/rectangle/text/artboard tools, arrange/align/distribute/nudge, board/project properties, SVG/project export. Not a book/typesetting engine.

Two-side concept: Layers/Artboards/Colours left; Selection/Arrange right. Separate document properties if dense, not duplicated fields.

| Adobe tool | Status / Somnia mapping | Next step |
| --- | --- | --- |
| Text-frame move/resize [A10] | Have narrower text/layer/bounds model | Direct candidate: numeric bounds/fit-to-content only after text-metric check. |
| Artboard tool [A4] | Have create/select/size operations | P1 contextual presets and ergonomics, no duplicate tool. |
| Named/grouped/stacked workspaces [A9] | Have stack/per-studio state; named presets unverified | Direct candidate after shared placement contract. |
| Advanced typesetting/print workflow | Not verified by source or current model | Expensive; not a claim established by the selected frame article. Separate research needed. |

First package: split document from selection properties, keep Layers default. Gate: board switching/text/export preserve data and selection.

## 9. Vector Studio: Illustrator

Current: `lib/studios/vector.ts`, `components/vectorstudio/{registerShell.ts,VectorPanels.tsx}`: select/node/pen, rectangle/ellipse/line/polygon/star; Layers/Tools; Page/Transform/Style/Nodes; rotate/flip/bounds/style, node edits/closure, SVG import and SVG/PNG export. Not certification of complex SVG fidelity.

Two-side concept: Tools/Layers left; Shape right; Page/Export separate and reachable. Node selection updates properties, not the chosen panel layout.

| Adobe tool | Status / Somnia mapping | Next step |
| --- | --- | --- |
| Selection/Direct Selection/Pen [A4] | Have narrow equivalents | P1 tool options and keyboard parity. |
| Add/Delete/Convert anchors [A4] | Node commands present; exact add interaction needs check | Direct candidate: contextual node actions over existing operations. |
| Magic Wand attribute selection [A4] | Equivalent unverified | Direct candidate: Select same fill/stroke, exact equality only; define hidden/locked/group scope. |
| Lasso [A4] | Vector equivalent unverified | Direct candidate for point/bounds enclosure after hit-test spike; accurate path intersection costs more. |
| Rotate/Reflect/Scale [A4] | Have rotate/flip/bounds | Verify pivots and numeric controls. |
| Shape Builder/Live Paint/Mesh [A4] | Equivalent unverified | Expensive: robust geometry/topology/paint model. |
| Type/Area Type/Type on Path [A4] | Text-layout parity unverified | Expensive: shaping, curve metrics and SVG fidelity. |

First package: node ergonomics and Select same. Gate: undo/export geometry and hidden/locked behaviour stay correct.

## 10. Photos Studio: Photoshop adjustments/workspace

Current: `lib/photos/{panelManifest,shellRail,studioSettings}.ts`, `components/photos/panels/hostMap.ts`: Histogram; Light exposure/contrast/highlights/shadows/whites/blacks; Color temp/tint/vibrance/saturation; Effects texture/clarity/dehaze; Detail sharpen/noise; Transform straighten/rotate/flip/crop; Presets/History/Info/copy export. JPEG/PNG develop is not layered editing, editable PSD or RAW parity.

Two-side concept: first pilot, Presets/History/Info left; Histogram/adjustments/Transform/Export right. No fictional Photos Layers panel.

| Adobe tool | Status / Somnia mapping | Next step |
| --- | --- | --- |
| Crop/transform/exposure/contrast [A2] | Have narrower global develop controls | P0 redistribute hosts, unchanged processing. |
| Group/stack/contextual panels [A3] | Have shell primitives; right side dense | Direct candidate: companion's migration and canvas budget. |
| Levels/Curves [A2] | Histogram is not an editable curve pipeline | Expensive until tonal-domain/settings/render/export verified. |
| Masks/adjustment layers [A2] | Not established in Photos path | Expensive, separate layer engine work. |
| Clone/Healing [A2,A13] | Pixel-paint model unverified | Expensive: sampling/strokes/undo/colour/export. |
| RAW editing [A2] | Only JPEG/PNG path established here | Expensive: decode/profiles/demosaic/colour management. |
| Generative fill/expand [A2] | No assigned equivalent | Not a goal. |

First package: real preset/adjustment workflow. Gate: histogram/history/crop/export correct; fake-worker UI tests do not prove develop pixel quality.

## 11. Vibe Space: no direct Adobe counterpart established

Current: `lib/studios/vibespace.ts`, `components/vibespace/registerShell.ts`: Spaces/Runs/Needs review left; Memory/Skills/Space/Run/Usage/Checkpoints right. Memory/Skills require space/native services. No format claims or document-editor takeover.

Two-side concept: already useful, work queue left and selected-run context right; board remains central.

| Adobe reference | Status / Somnia mapping | Next step |
| --- | --- | --- |
| No equivalent in selected docs | Not applicable | Do not describe Firefly/Express as an autonomous development workspace. |
| Panel workspace [A9], analogy only | Have per-studio state | Direct candidate: focused-review layout preset. |
| Generative creative tools [A2,A5] | Different purpose | Not a goal of this comparison. |
| Run/checkpoint/usage context | Somnia-native, not Adobe parity | P1 one selected-run context and readable review/status. |

First package: focused review layout. Gate: moving/opening panels never starts/cancels a run or approves an action; existing confirmation rules unchanged.

## 12. Raster editor: extra workflow, not an eleventh studio

`components/RasterEditor.tsx`: Tools/Transform left; Adjust/Filter/Layers/History/Info/experimental Develop right. Layer mode disables legacy adjust/filter/transform, starts from a pristine raster up to 1 MP, and exports a composite copy, not a layered file. Legacy and worker histories differ.

| Photoshop tool | Status / Somnia mapping | Next step |
| --- | --- | --- |
| Selection/masks [A2] | Selection editor and mask-from-selection, path-specific limits | Have narrowly; inspect selection algorithms before claiming whole suite. |
| Duplicate/visibility/opacity/masks [A2] | Have bounded worker-layer controls | P2 adapter/parity before moving Layers/History left. |
| Clone Stamp [A13] | Source-point/stroke UI unverified | Expensive until sampling/undo pipeline exists. |
| Adjustment layers/Smart Objects [A2] | Layer mode disables legacy adjustments | Expensive: non-destructive pipeline and serialization. |
| Brush/Eraser/Healing [A2] | Unverified in inspected panels | Separate paint-engine spike, not an immediate button. |

First package: panel adapter, not new paint tools. Gate: do not cross incompatible operation modes; keep raster/Photos layouts separate.

## 13. Decision and test boundaries

Review requested: shared direction and Photos-first pilot; prioritize other packages independently. Recheck integration source before development. Use companion's model/registry/component/workflow/persistence/visual gates. No runtime layout or tools were visually verified here. No application tests, WASM/Cargo builds, pushes or releases were performed for this documentation-only proposal.

## 14. Adobe source ledger

Public Adobe Help pages fetched/read 2026-10-14. Article bodies support the claims, not unrelated navigation items. Difficulty estimates are ours, not Adobe's.

| Id | Source | Claims |
| --- | --- | --- |
| A1 | https://helpx.adobe.com/dreamweaver/using/writing-editing-code.html | Insert/Emmet/hints, multiple cursors, Wrap Tag, Quick Docs/Edit, JS refactoring. |
| A2 | https://helpx.adobe.com/photoshop/web/get-set-up/learn-the-basics/compare-photoshop-web-and-desktop-features.html | Resize/select/paint/retouch/adjustment/layer/RAW/generative families. Updated 2025-10-28; not proof later additions are absent. |
| A3 | https://helpx.adobe.com/photoshop/desktop/get-started/learn-the-basics/workspace-overview.html | Tools, panels, grouping/stacking and contextual properties. |
| A4 | https://helpx.adobe.com/illustrator/using/tools-in-illustrator.html | Draw/select/navigate/paint/text/modify tools. Updated 2026-06-15. |
| A5 | https://helpx.adobe.com/premiere/desktop/get-started/tour-the-workspace/tools-panel-and-options-panel.html | Selection, Track Select, Ripple, Razor, Slip, Pen, shapes, Hand, Text, Generative Extend. |
| A6 | https://helpx.adobe.com/audition/desktop/applying-effects/effects-controls.html | Rack up to 16 effects, bypass/reorder, mix/levels, presets, clip/track racks. |
| A7 | https://helpx.adobe.com/express/web/documents-and-presentations/manage-pages.html | Duplicate/skip slide, transitions, presenter notes. |
| A8 | https://helpx.adobe.com/express/web/documents-and-presentations/presentation.html | Fullscreen presenting and separate notes window. |
| A9 | https://helpx.adobe.com/indesign/desktop/get-started/settings-and-preferences/create-and-manage-workspaces.html | Named saved panel sizes/positions, grouped/stacked/docked panels. |
| A10 | https://helpx.adobe.com/indesign/desktop/add-and-manage-text/add-and-manage-text-frames/create-position-text-frames.html | Type frames, selection/move/resize/fit-to-content. Updated 2026-06-02. Not a full typesetting inventory. |
| A11 | https://helpx.adobe.com/acrobat/desktop.html | Help index and change/replace/delete text entry, not full PDF editing review. |
| A12 | https://helpx.adobe.com/acrobat/desktop/protect-documents/redact-pdfs/redact.html | Redact text/images and apply redaction workflow. |
| A13 | https://helpx.adobe.com/photoshop/desktop/repair-retouch/heal-clone/retouch-images-with-the-clone-stamp-tool.html | Clone sampling/alignment/layers/opacity/flow. Updated 2026-02-23. |

Somnia source provenance: baseline SHA plus per-studio paths above and the companion inventory. Adobe docs prove Adobe features only, never Somnia parity or approval.
