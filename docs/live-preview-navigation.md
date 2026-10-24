# Live preview file links

The preview has its own bounded (100 entry) Back/Forward history. Navigation does not open an editor tab, mutate source files or change the active studio. Fragment links scroll to an element ID or named anchor, including fragments on another HTML page. Project-root `/` links are supported. Query strings are ignored because this is a static preview, not a server.

Link paths use the W1 project resolver, with stricter URL/control-character, encoding and backslash checks before resolution. Only `.html`/`.htm` paths are eligible. Paths that leave the project root, disk URLs, custom protocols, downloads and form navigation are blocked. Unopened HTML is read through `read_project_resource`, scoped to the current project capability and capped at 8 MB; a result arriving after a project change is discarded. Loaded text never overwrites an unsaved editor buffer.

A trusted navigation bridge runs when project scripts are off: a fresh CSP nonce permits only this bridge while authored scripts remain removed and inline event handlers remain CSP-blocked. Sandbox remains `allow-scripts` only, with no same-origin, popups, top-navigation or network. The bridge intercepts trusted clicks and handles fragments via a parent-to-frame scroll message. Every parent message handler checks the frame source and per-render ID. Same-document anchor changes do not rebuild the page.

External HTTP(S) links open through `open_preview_external`, separate from the existing GitHub-only `open_external`. Both frontend and native handlers reject credentials and non-web protocols. The parent requires active user activation before opening. The native handler applies the existing main-window gate and launches one URL argument without a shell. Forms are prevented in the bridge and denied by CSP.

## Integration

`buildPreview` keeps W2's fifth `assets` parameter and adds a sixth `hash` parameter. `buildPreviewWithAssets` adds an optional final `hash`. The UI builds `nav.files` at `nav.file`, not the editor's active document, and passes the visit scroll/hash. W1 must load linked text resources from that visited document, including `nav.files[nav.file]` for clicked unopened HTML. The on-disk HTML reader uses the current Versions session's existing project capability; it does not create a grant.

## Checks

`previewNavigation.test.ts` covers path containment, encoded traversal, root links, fragments, invalid protocols, missing files and bounded history. `preview-navigation.spec.ts` exercises the real builder and hook in an isolated React browser harness: scripts-off enforcement, nested HTML links, anchor scrolling, Back/Forward, root escape rejection, external browser opening and sandbox attributes. `preview_links.rs` contains native URL-validation tests. The harness intentionally excludes unrelated WASM studios.
