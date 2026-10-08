# Context UI integration notes

Base: `somnia-agent` / `23f739980d985792b939942a8182a0babf0e9569`.
Branch: `feat/context-aware-ui`. No remote push, merge or release performed.

Apply the attached format-patch series in order. New shared files: uiContext, uiContextStore, contextRegistry. Native editor integrators should call `setUiToolState` with active tool and selection, and must clear state on document changes. The registry currently describes sections independently of rendering; component rendering lives in ContextSections and is not an extension SDK registration API yet.

Defaults: context chip on, panel follow off, floating text format on. Workflow preferences sanitize older records. Section preference key: `somnia.ctxSections.v1`. Existing panel visibility and tab choice are preserved.

Modified hot spots likely to conflict with concurrent work: App.tsx, Settings.tsx, Inspector.tsx, IconRail.tsx, StatusBar.tsx, workflowPrefs.ts and all locale files. Merge the new ctx.* keys, do not replace other concurrent locale additions. Do not replace the dedicated native image editor with a stub.

Remaining spec items: component-specific props pin currently links to the existing Components panel rather than embedding its variant-bound renderer. Tag conversion, CSS Go-to-rule, Markdown inspector format/outline, rich native inspector/status/toolbars, diagnostic filtering, peer-edit chip, selection dimensions in bottom slot and full profiler/glass/native acceptance are follow-up work. These are not claimed complete. No new core operations were introduced.
