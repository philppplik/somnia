# PDF and page-layout UX: a bounded Somnia v1

Research date: 2026-10-07. Documentation-only proposal, not a shipped feature.

## Answer

Use Acrobat's page-organizer model for the first PDF release: thumbnails, explicit selection, reorder/rotate/delete/extract, and export a new copy. Borrow the document-level navigation and issue-to-object links from InDesign, Affinity Publisher and Scribus, but do not imply that opening a PDF recovers an editable publishing document. Parent pages and threaded stories are authoring concepts with their own persistent document model, not small additions to a PDF viewer. Keep them in a later layout-authoring milestone. A v1 can be useful without promising arbitrary existing-text editing, print certification, OCR, secure redaction or complete round-trip fidelity.

## Ranked implementation options

| Rank | Product shape | User value | Feasibility / release gate |
| --- | --- | --- | --- |
| 1 | PDF organizer with local preview and save-copy | Fix page order, remove pages, rotate, split/extract; preserve original | Recommended v1, conditional on engine and round-trip fixtures from the separate PDF research |
| 2 | Organizer plus explicitly additive text/image overlays | Add a label or image without claiming to edit underlying content | Optional v1.1, only after font embedding, transforms, undo and export fidelity work |
| 3 | Native layout document with pages, objects, reusable parents and stories | Create brochures and multi-page designs, then export PDF | Separate authoring track; not honest as a small PDF-editing v1 |
| 4 | Arbitrary PDF object/text reconstruction and production preflight | Acrobat-like editing and print workflows | Defer; renderer, structure, typography, security and validation risks must be solved first |

No time estimate is claimed. Feasibility here means a bounded interaction/model scope, not a validated engine capability.

## Criteria and evidence boundaries

- Scope: pages panel, document navigation, parents/masters, linked text and preflight. This report deliberately does not redo PDF library selection or licensing.
- Official Adobe desktop documentation, official Affinity Publisher 2 documentation, Scribus 1.6.4 shipped help mirrored by Fossies, an archived independent Scribus manual, and an Adobe community thread were read. Sources below identify version and limitations.
- InDesign documentation uses **Parent Page**, explicitly the newer name for Master Page. Use a plain-language label such as "Parent pages" with a "master pages" search alias in any future Somnia authoring UI. [I2]
- Affinity findings are Publisher 2 findings. The newer affinity.studio help URLs returned only a shell, so they are not used as evidence of current replacement-product behaviour. Publisher 2 pages were recovered from its actual help index, not guessed from search snippets.
- The new Scribus 1.8 manual pages fetched here contained navigation and headings without substantive instructions. They are not proof of 1.8 behaviour. Scribus findings below are version-qualified older documented patterns.
- These are documented interaction patterns, not a hands-on benchmark. No current product screenshots or installed applications were inspected. Exact visual styling, platform-specific modifiers and accessibility quality remain unverified.

## Product comparison

| Product | Pages/document work | Repeated design | Text flow | Preflight model |
| --- | --- | --- | --- | --- |
| InDesign | Pages panel; parents and document pages; facing and special multi-page spreads | Linked parents, nested inheritance, explicit overrides | A story traverses frames via in/out ports; overset and thread guides | Live document check, profile and page/layer scope |
| Acrobat | Organize Pages thumbnails; page operations, selection and cross-document move/copy | Do not confuse header/footer tools with a DTP parent-page model | Existing PDF text is edited through selected boxes; this research does not establish DTP story reconstruction | Acrobat Pro analyzes the existing PDF, optionally applies fixups |
| Affinity Publisher 2 | Pages panel has master and publication sections; page/spread selection, fit-view and Move/Copy dialog | Hierarchical masters; inherited layer markers; local placeholder content | Triangular flow ports, connectors, preserved overflow and explicit one-shot AutoFlow | Live/Export/Never, severity icons, page/object links, configurable profiles |
| Scribus (older documented patterns) | Arrange Pages and Outline distinguish document pages and masters | Masters as repeating background content; separate edit mode | Manual frame linking, overflow marker; optional automatic frames at document creation | Destination profile, select issue to select object and jump page, rerun before output |

Sources: [I1-I4], [A1-A4], [F1-F7], [S1-S4]. "Not established" is not a claim that a product lacks a feature.

## 1. Pages panel and document navigation

### InDesign

The Pages panel is the common location for both document pages and parents. Dragging a document spread into its Parents section creates a reusable parent. Applying a parent by drag targets a page, with a black rectangle around the destination; multiple selected document pages can receive a parent together. [I1]

Spreads are a separate semantic unit. Disabling page shuffling preserves an "island spread", marked by brackets around its page numbers. Pages and entire spreads have different drag handles. Individual page sizes can differ from parent dimensions. [I4]

**Lesson:** distinguish a page selection from a spread selection; expose an insertion preview; keep special spread rules out of basic page ordering.

### Acrobat

Organize Pages shows thumbnails, with Shift for a consecutive range and Ctrl/Cmd for non-adjacent selection. Desktop move/copy between two open PDFs uses selected thumbnails; context-menu Copy/Paste is an alternative to dragging. Web Organize Pages documents drag-to-reorder and hover rotation/deletion controls. These web and desktop details are deliberately not treated as identical UI layouts. [A1, A2]

**Lesson:** page operations form a useful workflow without editable text objects. Give large-distance moves a deterministic destination control instead of requiring long drags.

### Affinity Publisher 2

The Pages panel separates Master Pages from publication Pages and provides add, duplicate, delete and Section Manager actions. Selecting a thumbnail allows viewing/editing; clicking twice opens its page, and double-clicking a page-number label or spread centre fits the spread into view. [F1]

Drag shows a blue insertion point and a cursor that distinguishes extending a spread from inserting a new spread. Move/Copy Pages also accepts a page number and Before/After destination. Page reflow and what happens to inherited master objects when crossing the spine are explicit preferences, not neutral reorder operations. [F2]

**Lesson:** selection, navigation and fit-to-page are different commands. Do not make a PDF reorder silently mirror or reposition page contents, as a layout document might.

### Scribus

The archived manual describes Arrange Pages for navigation and master assignment, and Outline as a tree of open documents, masters and pages. Double-clicking a master switches into master editing. [S1]

**Lesson:** navigation can be backed by a flat thumbnail panel and a structural tree, but Somnia should not add two competing panels to v1.

### Proposed Somnia interaction contract

This is a recommendation, not an observed competitor feature:

1. A PDF tab opens with a left Pages panel and centre page preview. Keep familiar right-side context properties and the existing Problems area; no second DOM/layers tree for an immutable imported PDF.
2. Single click activates one page. Shift-click selects a range; Ctrl/Cmd-click toggles pages. Show the selected count and page labels. The current preview page and the operation selection must be visually distinct if they differ.
3. Drag selected thumbnails onto a clear insertion bar between pages. Only after drop does order change. A Move Pages dialog offers Before/After plus destination for long documents and keyboard use.
4. Context menu: rotate left/right, duplicate, delete, extract, move. If an operation is not supported by the chosen engine, omit it rather than present an inert control.
5. Delete is undoable, names the selected pages, and cannot silently leave an invalid empty document. No confirmation for every reversible single-page action; confirmation for irreversible effects or closing dirty work.
6. Page identity must survive reorder. Display order and PDF page labels are not persistent identifiers. After reorder, keep the active page by identity, not its old numeric index.
7. Keep mixed page sizes and rotations visible in properties. V1 uses single-page preview; facing spreads are a view option later, not repagination.
8. Large documents need virtualized thumbnails, cancelable loading and explicit load/error states. Limits are for the builder to validate, not numbers invented here.
9. Export dialog says exactly which pages and which operations are applied. Default to "Save edited copy"; never silently overwrite the original.

## 2. Parents/master pages

### What the tools actually model

- **InDesign:** parent elements update associated document pages. Dotted borders distinguish inherited content, which cannot normally be selected without an override. A child parent can inherit from another parent. Parents can include placeholders and dynamic page-number markers. Parent content has layer-relative stacking, so "master always behind everything" is not an accurate cross-product rule. [I1, I2]
- **Affinity Publisher 2:** a master can apply to other masters. Applied masters appear as layers; solid versus dotted turquoise markers distinguish inherited versus locally edited items. Text/picture-frame content can be changed on a publication page without changing the master, while individual inherited object transformation needs detachment. Users can apply/replace masters or add another master. [F3-F5]
- **Scribus archived manual:** masters are repeating background content, with a separate edit mode. Close the master-edit dialog to return to document-page editing. Converting a normal page into a master and applying a master to individual or multiple pages are documented. The background-only statement is tied to that historical manual, not generalized to all versions. [S1]

### Minimum credible later authoring milestone

Start with one non-nested parent per native layout page, clearly marked inherited objects, a named "Edit parent" mode with "Return to page", and Apply to selected/all pages. Explicitly say how many pages are affected before a parent edit. Use a single source definition plus references, not cloned copies advertised as linked parents.

Defer multiple/nested parents, inherited geometry overrides, cross-spine mirroring, parent migrations and automatic layout adjustment. If v1 merely stamps the same content onto selected PDF pages, call it "Apply overlay to pages", not "Master pages": the repeated objects are copies unless a saved project model keeps a live relationship.

## 3. Text linking and overflow

### InDesign

A single story flows through frames. Empty in/out ports mark its ends, arrows indicate links, and a red plus on an out port means overset text. Show Text Threads draws the connections. Click an out port, then an existing frame or drag a new one. The loaded cursor can survive page navigation and zoom. Canceling the operation does not delete text. [I3]

Unthreading retains content as overset in the earlier story; deleting a frame in a chain flows its text onwards. Deleting an unlinked frame deletes both frame and text. These are different operations and deserve explicit undo semantics. [I3]

### Affinity Publisher 2

A triangular flow button can target an existing frame or draw a new one; connector lines show the sequence. Overflow is stored, not discarded, and exposes a red flow button and an eye control. AutoFlow creates new frames/pages as a one-off action; it is not continuous automatic pagination, does not fill existing frames, and reducing content leaves empty frames in place. Unlinking retains downstream text in the earlier frame as overflow. [F6, F7]

### Scribus

The archived workflow starts with a text frame, imports text, shows an X overflow marker, and requires a new frame plus Link Text Frames for continuation. Creating an automatic-text-frame document makes newly added pages include linked frames, a different workflow from automatically adding pages whenever text overflows. The archived guide cautions that unlinking in the middle may have unexpected results and recommends undo. [S2]

### Proposed authoring design, not PDF v1 scope

A native story should own the text independently of its frame chain. Frames refer to one story and define order; they should not each store destructive slices of text. On selection, show in/out ports and the chain, plus a labeled overflow count if measurable. Link mode needs Escape/cancel, keyboard target selection, invalid-target feedback and prevention of cycles or merging populated stories without a reviewed rule.

Do not auto-shrink text to conceal overflow. Do not delete overflow on export. Offer explicit fixes such as enlarge frame, link to another frame or add continuation page. Future unlink/delete rules must be documented, undoable and tested. Two useful stages are manual linking first, then explicit one-shot AutoFlow; neither requires promising always-on automatic pagination.

**V1 PDF boundary:** ordinary imported PDF pages are not native story/frame documents in this proposal. Text selection/search, text extraction, additive text and destructive replacement are distinct capabilities. A selectable text layer does not prove safe editability. OCR is not part of this scope. Acrobat's actual text editor displays selected text boxes and has installed-font constraints; that is evidence of the problem space, not proof Somnia can match it. [A3]

## 4. Preflight versus "document checks"

### Distinct jobs

- InDesign checks an authoring document while work happens: missing fonts, modified links, overset and low-resolution assets. The panel can scope by pages/layers and use embedded or working profiles. [I5]
- Affinity Publisher 2 has Live, Export and Never modes, a colour/state indicator, profile thresholds and configurable severity. Click a page reference (M for a master) or double-click an issue to navigate; certain issues have a Fix button. On export, errors offer a chance to abort and review, rather than the simplified claim that every red error makes export impossible. Placed PDF passthrough/rasterization warnings expose actual output consequences. [F8, F9]
- Scribus 1.6.4 help documents output-destination profiles, issue/object/layer rows, select-to-jump, rerun and an export-anyway choice. It distinguishes warnings worth reviewing from unavoidable defects. Its archived independent manual says automated checks do not replace output proofing. [S3, S4]
- Acrobat Pro inspects an already-created PDF for production conditions, including colour, fonts, transparency, resolution, ink coverage and compatibility. Analyze and Analyze And Fix are different actions; fixups can change the file. PDF standards and output intents belong to this deeper workflow. [A4]

### Bounded Somnia v1 document checks

Use the existing Problems panel, filtered to the active PDF, rather than a new permanent preflight panel. Proposed issue rows: severity, plain-language consequence, page, object/operation where known, and next step. Clicking selects/navigates to the relevant page. A single status indicator opens this panel.

Only report checks the selected engine and model can substantiate:

| Check | Suggested behaviour | Capability condition |
| --- | --- | --- |
| Parse or permission failure | Stop the affected operation; explain why | Parser returns a verified failure/permission state |
| Invalid/empty page selection or unsupported operation | Block the action before mutation | Known page list and explicit operation support |
| Overlay image/font unavailable | Block that export or offer removal of the addition | V1.1 only; local assets are tracked |
| Known loss of structures/metadata on export | Warn before save; default is cancel/review | Fixture-verified engine limitation; do not infer preservation |
| Signature invalidation / protected file | Explain and stop unsupported editing | Detectable state; otherwise mark support unverified, do not promise validity |
| Native text overflow | Error linked to frame/story | Future layout-authoring model only |
| Effective image resolution | Warn with output-specific threshold | Future layout image geometry and original pixel dimensions are available |
| Print/PDF-A/PDF-X/PDF-UA compliance | No certification in v1 | Requires a proper validator and separately approved scope |

Use wording such as "No issues found in supported checks", with a visible supported-checks list and last-check/export state. Grey/not-run must not look like a green pass. Do not label v1 "print-ready". Fixes that change content, flatten features, replace fonts or rasterize need preview plus undo/review, not silent remediation.

## 5. v1 definition and acceptance gates

### In scope, if the separate engine research supports it

- Local PDF open and page rendering; stable page selection and thumbnail navigation.
- Reorder, rotate, remove, duplicate and extract selected pages, each individually gated by engine capability.
- Undo/redo for supported changes, dirty state, close-with-unsaved warning and save-copy export.
- Document checks with honest coverage; clear unsupported/protected/scanned-document states.
- Keyboard equivalents, textual labels/tooltips and non-colour-only states.

No new dependency, API or implementation is introduced by this report.

### Acceptance checklist for the central builder

1. Page selection is deterministic for single/range/toggle selections. Actions apply to the selected pages, not accidentally just the preview page.
2. A reorder preserves stable identity, selection and active page; undo restores exact order.
3. Multi-page move does not reverse selected order; rotation composes correctly; delete/duplicate/extract have explicit behaviour for the final page and empty selection.
4. Preview and exported bytes agree for mixed sizes and rotations, page boxes and overlays if enabled. Save, reopen and render the exported copy, not merely check file existence.
5. A failure/cancel leaves the original bytes untouched and no misleading success state. No implicit overwrite, external font or remote asset request.
6. Fixtures cover scanned PDFs, embedded/subset fonts, non-Latin text, links, annotations, forms, outlines, attachments, encryption and signatures. Publish what is preserved, dropped, unsupported or still unknown; do not guess.
7. Large/corrupt-input behaviour has measured limits and cancellation. Success for a tiny sample is not a performance or hostile-file safety guarantee.
8. Checks distinguish not-run, in-progress, warning/error and unsupported. Export warnings are visible before committing the save.
9. Windows/macOS/Linux keyboard modifiers, focus order, zoom, scroll and save-dialog behaviour are tested in the actual application.
10. Later pure-operation tests belong in the existing node:test-based `test:core` suite. This docs-only change adds no unit tests and does not claim implementation validation.

### Explicitly deferred

Arbitrary existing-text editing, font substitution/reconstruction, scan OCR, secure redaction, signature preservation/signing, interactive form editing, native master pages, text threading, always-on pagination, print colour management, imposition, bleed automation, PDF standards certification, and guaranteed imported-PDF round-trip preservation.

Covering text with a white rectangle is not redaction. Rendering success is not proof that extraction order, tags, forms, links or signatures survived export.

## Open decisions / unverified work

- **Product boundary:** approve organizer-first versus a separate native layout-authoring mode. Avoid one "Edit PDF" button that conceals these very different capabilities.
- **Engine gates:** the parallel PDF engine/license work must prove each offered operation, security limits and structure preservation. This report makes no new license verdict.
- **File model:** determine how dirty sessions and undo persist/recover, whether a native project exists for additions, and which changes are export-only.
- **Import/export matrix:** links, annotations, forms, tags, bookmarks, attachments, page labels, encryption and signatures need fixture-based results.
- **Geometry:** page boxes, coordinate origins, rotation and crop interactions need engine-specific verification.
- **Typography:** additive text needs local font selection/embedding and script coverage. Native stories need shaping, measurement, overflow, hyphenation and paragraph-style rules.
- **Accessibility:** correct focus, keyboard movement, text labels and exported-document accessibility have not been audited.
- **Authoring masters:** inheritance, stacking, overrides, deletion and migration semantics need a separate saved-document design.
- **Preflight language:** supported-check coverage and export interruption rules must be approved. No green print-certification badge in v1.
- **Visual evidence:** competitor UI observations are manual-based. No side-by-side pixel inspection or Somnia UI implementation was performed.
- **Testing:** no runtime code changed; no runtime test suite was run for this report. Builder integration and visual export checks remain open.

## Source notes

All URLs below were opened and their relevant content read on 2026-10-07 unless marked excluded. Dates are visible source dates, not assumed publication dates. Affinity pages had no visible dates. For the full evidence ledger see `pdf-layout-ux-sources.md`.

### Adobe InDesign: official documentation

- **I1** Create and apply parent pages: https://helpx.adobe.com/indesign/desktop/create-and-organize-pages/create-and-manage-parent-pages/create-parent-pages.html
- **I2** About Parent Pages, updated June 2, 2026: https://helpx.adobe.com/indesign/desktop/create-and-organize-pages/create-and-manage-parent-pages/about-parent-pages.html
- **I3** Thread text frames, updated June 2, 2026: https://helpx.adobe.com/indesign/desktop/add-and-manage-text/add-and-import-text/thread-text-frames.html
- **I4** Create multi-page spreads: https://helpx.adobe.com/indesign/desktop/create-and-organize-pages/create-documents/create-multi-page-spreads.html
- **I5** Configure and use the preflight panel: https://helpx.adobe.com/indesign/desktop/print/preflight/configure-and-use-the-preflight-panel.html

### Adobe Acrobat: official documentation

- **A1** Move/copy pages between PDFs, desktop: https://helpx.adobe.com/acrobat/desktop/edit-documents/organize-pages/move-between-pdfs.html
- **A2** Organize pages, web: https://helpx.adobe.com/acrobat/web/edit-pdfs/organize-documents/organize-pages.html
- **A3** Change, replace or delete text, updated May 29, 2026: https://helpx.adobe.com/acrobat/desktop/edit-documents/edit-text-in-pdfs/modify-text.html
- **A4** Analyzing documents with Preflight (Acrobat Pro): https://helpx.adobe.com/acrobat/using/analyzing-documents-preflight-tool-acrobat.html

### Affinity Publisher 2: official versioned help

- **F1** Pages panel: https://affinity.help/publisher2/English.lproj/pages/Panels/pagesPanel.html
- **F2** Arrange pages: https://affinity.help/publisher2/English.lproj/pages/Pages/arrangePages.html
- **F3** About master pages: https://affinity.help/publisher2/English.lproj/pages/Pages/masterPages.html
- **F4** Applying master pages: https://affinity.help/publisher2/English.lproj/pages/Pages/applyMasterPages.html
- **F5** Editing master placeholder content: https://affinity.help/publisher2/English.lproj/pages/Pages/editMasterPageContent.html
- **F6** Flowing text through frames: https://affinity.help/publisher2/English.lproj/pages/Text/flowingText.html
- **F7** Linking text frames: https://affinity.help/publisher2/English.lproj/pages/Text/linkingTextFrames.html
- **F8** Preflight panel: https://affinity.help/publisher2/English.lproj/pages/Panels/preflightPanel.html
- **F9** Preflight: https://affinity.help/publisher2/English.lproj/pages/Publishing/preflight.html

### Scribus: shipped documentation and archived independent manual

- **S1** FLOSS Manuals, Master Pages, Guides and Scrapbook, undated archive: https://archive.flossmanuals.org.uk/scribus-2/master-pages.html
- **S2** FLOSS Manuals, Importing text and images, undated archive: https://archive.flossmanuals.org.uk/scribus-2/importing-text-and-images.html
- **S3** Scribus 1.6.4 `doc/en/print2.html`, mirror identifies package member dated April 20, 2025: https://fossies.org/linux/scribus/doc/en/print2.html
- **S4** FLOSS Manuals, Quality Control, undated archive: https://archive.flossmanuals.org.uk/scribus-2/quality-control.html

### Community context, not authoritative capability proof

- **C1** Adobe community, January 22, 2025, user asks how to link frames across pages; answers discuss ports, styles and autoflow: https://community.adobe.com/questions-671/how-do-i-link-text-boxes-across-multiple-pages-894062. This illustrates a discoverability need, not prevalence or usability measured across users.

### Excluded from behavioural evidence

- New Affinity help pages returned shell-only content, for example https://www.affinity.studio/help/panels-pages-panel/.
- New Scribus 1.8 manual topics returned headings/navigation only, for example https://scribus-manual.readthedocs.io/en/latest/manual/text/text_frame/link_text_frames.html.
- Scribus Wiki pages returned an anti-bot challenge; no challenge was bypassed, for example https://wiki.scribus.net/canvas/Working_with_Master_Pages.
- An Affinity forum topic returned its title but no substantive replies: https://forum.affinity.serif.com/index.php?%2Ftopic%2F198820-text-frames-on-master-pages-vs-pages%2F=.
