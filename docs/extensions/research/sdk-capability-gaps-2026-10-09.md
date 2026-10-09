# Somnia SDK: capability gaps and recommended order

Research date: 9 October 2026. Target baseline: audit supplied by the parent at `somnia-agent` commit `1d014e1`.

## Recommendation

Keep Somnia's sandbox-first model. Borrow VS Code's contribution/provider architecture, Obsidian's local document lifecycle and Figma's typed scene operations, but not VS Code/Obsidian's broad desktop access. The first useful expansion is **brokered, undoable edits plus scoped events**, not unrestricted JavaScript workers. That unlocks real extensions without turning every installed plugin into an owner of the user's machine. Studio and AI extension points should use the same broker.

This is a research proposal, not an implementation or a second code audit. The supplied baseline describes manifest v1 (`apiVersion: 1`), commands/snippets/code themes/panels, read-only panel project APIs, stripped selection attributes, storage and notifications. Local worker support exists but is blocked in the GitHub catalog; the supplied audit identifies a native CSP conflict. No checkout was available to independently validate those findings. Gaps below are relative to that baseline; anything it does not explicitly cover needs code verification.

## Ranked gap list

| Priority | Contribution point / API | Competitor evidence | Somnia recommendation and value |
| --- | --- | --- | --- |
| P0 | Consistent extension runtime and capability enforcement | Figma separates scene execution from iframe UI through messages [F1, F2]. | Fix the audited Blob-worker/AsyncFunction vs native CSP conflict before expanding catalog execution. Use packaged, CSP-compatible execution and a versioned typed RPC broker. Do not enable `unsafe-eval` globally as the shortcut. Test desktop and web separately. |
| P0 | Document edits and transaction lifecycle | VS Code has custom text editors backed by shared documents, change events and WorkspaceEdit; binary editors must implement save/undo/backups [V3]. Obsidian recommends editor edits for active notes and atomic Vault.process for background edits [O2]. Figma exposes typed scene creation/modification and undo commits [F3, F4]. | Add `document.applyEdits` and typed `scene.applyOperations`, with revision checks, one undo group, dirty-state integration and a preview/review path. Scope to selected documents/nodes and project-relative paths. Never expose direct host DOM mutation or disk overwrite as the normal API. Useful for templates, attribute fixes, batch content edits and layout tools. |
| P0 | Events, cancellation and disposal | VS Code custom editors subscribe to document changes [V3]; Obsidian has registered events and unload cleanup [O1, O2]; Figma documents document-change events and explicit page loading [F3]. | Expose scoped document/selection/project/studio change events, cancellation tokens and disposable registrations. Redact payloads to granted scope; debounce and cap event volume. This supports live word counts, inspectors and linting without polling the whole project. |
| P1 | Contextual menus, keybindings, settings and panel placement | VS Code contributes menus with `when` clauses, keybindings and settings [V1]. Obsidian offers settings tabs, custom views and ribbon/status entries [O1]. Figma offers command parameters, menus and relaunch actions [F1]. | Extend existing commands/panels rather than duplicate them. Add studio/file/selection predicates, typed command inputs, schema-based settings and user-rebindable shortcuts. Keep status output in Problems or existing panels; no unrestricted rail/status clutter. |
| P1 | Language and diagnostic providers | VS Code contributes languages and exposes completion, symbol and diagnostic APIs [V1, V2]. Obsidian allows CodeMirror 6 extensions and editor suggestions [O1]. | Register completion/hover/format/code-action/diagnostic providers with document selectors. Route issues to Somnia's Problems panel. Start with HTML email/A11y and CSS tooling. Prefer serialized provider results over injecting arbitrary CodeMirror extensions into the trusted UI. |
| P1 | Studio-specific documents, tools and import/export handlers | VS Code custom editors select file patterns [V1, V3]; Obsidian registers views and extensions [O1]; Figma declares editor types, exposes scene nodes and node export [F1, F3, F5]. | Add `documentHandlers`, `importers`, `exporters` and `studioTools` with file/MIME and studio selectors. Define small versioned adapters: Code text/DOM, vector nodes, raster operations, layout objects. Keep opaque binary handles and host-mediated export/save. Do not promise one universal object model for Sheets, Sound and Video before their host models are stable. |
| P1 | Typed AI tools and context providers | VS Code contributes language-model tools with input schemas and invocation confirmation; model use includes consent, cancellation and error handling [V4, V5]. | Add `ai.tools` first: schema, allowed studio, side-effect class, required capabilities, preview and cancellation. Read-only context providers expose only granted files/selection. AI tool invocation must pass the same edit/network permissions as manual invocation. Broker model calls through user-selected BYOK/local providers; never hand extension code API keys. |
| P2 | Brokered network, credentials and Git services | Figma declares allowed domains, development domains and sensitive permissions [F1]. VS Code/Obsidian allow broader host access, explicitly warning about its risks [V6, O3]. | Network is opt-in, domain-scoped and off by default. Separate localhost from internet access; credentials stay in a host secret store behind service calls. Expose Git status/history/diffs before commit/push or subprocesses. Ask again for new destinations or privilege expansion. FTP/SFTP/deploy are valuable Dreamweaver workflows, but belong after the permission model, not before it. |
| P1 foundation / P2 scale | Distribution and update integrity | VS Code packages VSIX, signs Marketplace extensions and scans releases [V6, V7]. Obsidian uses reviewed directory entries and GitHub release assets; later releases come from GitHub [O4]. Figma reviews public plugins and supports private organization distribution [F6, F7]. | Keep GitHub-based distribution but pin immutable release artifacts, digests, publisher identity, API/host compatibility and declared permissions. Require renewed approval for capability increases, offer rollback and revocation, and verify installed bytes. Private/offline packages should use the same validator. A searchable central marketplace is less urgent than reliable updates. |

P0 = blocker/foundation. P1 = first useful SDK expansion. P2 = later, after permission and document contracts. Distribution integrity must precede enabling executable catalog packages; no catalog change is proposed here.

## Permission model: copy selectively

- **VS Code:** Workspace Trust addresses whether project contents may execute; publisher trust addresses extension authors. Neither is a fine-grained extension sandbox. The extension host has VS Code's own permissions, including files, network and processes [V6, V8]. Somnia needs separate decisions for trusting a project and granting an extension capabilities.
- **Obsidian:** Restricted Mode disables third-party plugins. Once enabled, plugins inherit broad app access; the official documentation says it cannot reliably restrict individual permission levels [O3]. Borrow its lifecycle and local APIs, not this trust boundary.
- **Figma:** Main execution and iframe UI are separated; manifest permissions and domain declarations expose selected access [F1, F2]. Domain restrictions have an important caveat: embedded websites' subresources are not fully covered. This is not a complete template for local filesystem permissions.

Proposed Somnia grants: project-path-scoped read/edit, selected-scene read/edit, document events, domain-scoped network, host-brokered AI, Git read and Git mutation. Separate safe persistent grants from per-operation review for high-impact effects. Gate at the host boundary, not only in manifest validation or UI. Check path traversal/symlinks, RPC caller identity, serialization limits and quotas. Test iframe exfiltration channels including images, navigation and nested frames, not only fetch. Revoking a capability should stop pending operations and dispose subscriptions.

## Suggested sequence and proof extensions

1. Runtime parity, broker identity, schemas, version negotiation, lifecycle and native/web CSP tests. Keep v1 read-only panels working.
2. Revision-safe edits and events. Prove with an attribute/A11y fixer and a live inspector; both must undo correctly, reject stale revisions and survive disable/re-enable.
3. Contextual contributions and language diagnostics. Prove with an HTML email helper, without adding duplicated main-screen controls.
4. One studio adapter and import/export contract, then typed AI tools. Prove with a vector asset tool and an AI refactor that produces a reviewable diff, not silent writes.
5. Broaden network/deploy/Git and distribution only after adversarial permission tests and update rollback work.

A source map of API version to host version, fixture extensions and SDK contract tests should ship with each stage. Validate compatibility in the existing authoring tool rather than adding a separate toolchain by default.

## Defer

Do not chase a complete VS Code clone (debuggers, notebooks, terminal/process APIs) or Figma collaboration/user/payment APIs in the first expansion. Do not expose raw Tauri, Node, filesystem, DOM or CodeMirror internals to every extension. A plugin dependency graph, paid marketplace and unlimited background services add risk before the document model is ready.

## Evidence and uncertainties

Primary product documentation was fetched on the research date. These are API/security facts and design recommendations, not plugin-quality rankings; independent reviews are not evidence of an API contract. Official documentation, public API references and a public help-source repository were used. No runtime integration tests, effort estimates or current Somnia source validation were performed. The CSP conflict and absence of public Studio/AI/Git/diagnostic hooks come from the supplied audit. The exact existing menu/event/lifecycle/distribution implementation still requires code inspection. Recommendations should change if the existing host already has safe contracts for these areas.

### Sources

- [V1] VS Code contribution points: https://code.visualstudio.com/api/references/contribution-points
- [V2] VS Code API reference: https://code.visualstudio.com/api/references/vscode-api
- [V3] VS Code custom editor API: https://code.visualstudio.com/api/extension-guides/custom-editors
- [V4] VS Code language-model tools: https://code.visualstudio.com/api/extension-guides/ai/tools
- [V5] VS Code language-model API: https://code.visualstudio.com/api/extension-guides/ai/language-model
- [V6] VS Code runtime security: https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security
- [V7] VS Code packaging/publishing: https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- [V8] VS Code Workspace Trust: https://code.visualstudio.com/api/extension-guides/workspace-trust
- [O1] Obsidian Plugin API: https://docs.obsidian.md/Reference/TypeScript+API/Plugin
- [O2] Obsidian lifecycle/editing guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- [O3] Obsidian plugin security: https://obsidian.md/help/plugin-security ; public help source: https://github.com/obsidianmd/obsidian-help/blob/master/en/Extending%20Obsidian/Plugin%20security.md
- [O4] Obsidian submission and release assets: https://docs.obsidian.md/plugins/releasing/submit-plugin
- [F1] Figma manifest: https://developers.figma.com/docs/plugins/manifest/
- [F2] Figma execution environment: https://developers.figma.com/docs/plugins/how-plugins-run/
- [F3] Figma scene/API/undo: https://developers.figma.com/docs/plugins/api/figma/
- [F4] Figma editing properties: https://developers.figma.com/docs/plugins/editing-properties/
- [F5] Figma node export: https://developers.figma.com/docs/plugins/api/properties/nodes-exportasync/
- [F6] Figma public plugin review: https://help.figma.com/hc/en-us/articles/360039958914-Plugin-and-widget-review-guidelines
- [F7] Figma private organization plugins: https://help.figma.com/hc/en-us/articles/4404228629655-Create-private-plugins-for-an-organization
