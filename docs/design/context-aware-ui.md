# Context-aware shell

Implemented against `somnia-agent` at `23f7399`. The shared context is a pure value derived from the current file, surface, indexed selected nodes, cursor and optional native tool state. Selection is not the surface. Code view resolves the smallest source range containing the cursor; split follows canvas selection.

## Stable places

The web rail keeps Layers, Files, Search, Assets, Components, CSS, Versions. Context may add an advisory dot, never reorder items. The right rail keeps Design, Prototype, Code, then Chat and Agent. No panel changes tab automatically unless the user enables the workflow setting. Panel dimensions stay fixed across selection changes.

The inspector registry pins the relevant section and preserves standard order for the remainder: Layout, Style, Typography, Effects, Advanced, Computed. Irrelevant typography and multi-selection advanced fields are one-line disabled explanations. Section expansion and scroll position are remembered per domain/selection kind; Settings can reset section expansion.

Text has typography and content controls. Images have source, alternative text, decorative intent, loading and fit. Containers have layout. Form/media controls expose relevant attributes. Multiple selection exposes shared computed values or Mixed, aligns/distributes via the existing canvas backend, and writes shared styles in one transaction while skipping inherited locks. Advanced retains the original ID/class/text/CSS property controls. Computed retains metrics and box model.

## Header and status

A fixed-width context chip explains the domain and selection, announces changes politely, and shows lock state. Insert entries remain visible but disabled outside web contexts. Native media keeps the view-toggle space with disabled buttons. Undo/redo is disabled for native previews rather than operate on an unrelated HTML document.

Status save, context and viewport slots are separate components. Dialogs are hosted independently. The context slot supports web breadcrumbs, multi counts, source position and Markdown word count. Native preview zoom remains owned by its viewer, not the unrelated HTML viewport.

## Floating formatting

Text formatting defaults on, can be turned off in Settings, never focuses itself, and offers whole-element B/I/U through existing `formatText`. The existing inline range editor remains available on double click. The bar flips below a near-top selection, clamps horizontally, supports Escape and Ctrl+Shift+period. An image without alt has both an inspector warning and an element badge. Explicit `alt=""` is decorative and not warned.

## Native boundary

Raster/vector/PDF replace the web rail with a safe shell entry: Files and, for raster, the real image editor action. The existing raster editor is still modal and picks its own file; this action does not silently bind the active preview. Vector and PDF inline tools are not connected at this base revision. No inactive Crop/Pen/Anchor/Form tool is presented as working. Native contexts show Files rather than a stale HTML layer tree. Full native tool sets, SVG layer trees, PDF thumbnails, native histories and native tool options must be connected in the next integration wave.

## Verification

Pure derive tests exceed 40 cases, cover media precedence, source cursor, locks, mixed selections and native tool selections. A 5,000-node index benchmark checks the 0.2ms per-derive budget. Registry tests cover section pin/show/grey decisions. Five-language keys and placeholders are checked.

Playwright covers page, text, image, container, multi, code, native raster entry, manual tab preservation, real formatting, settings and lock controls, decorative alt, dark/reduced motion and high contrast. Web-rail screenshots mask only the two intentional advisory-dot slots; a small glyph-antialias tolerance is permitted. Shell geometry equality and shell-source layout-shift sum zero are strict.

Not certified: full visual pixel identity of advisory-dot slots, native tools, full React Profiler render counts, screen-reader behavior, Windows/Tauri runtime, global menu domain actions, CSS rule navigation and tag conversion. The latter two remain source-editor workflows rather than pretend inspector controls. Glass uses the existing appearance pipeline and needs the product's normal cross-platform visual pass.
