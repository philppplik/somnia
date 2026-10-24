# Vector command specs

`commands.ts` wraps the existing session engine with 28 typed specs. The UI's existing callbacks and shortcuts are unchanged. `store/vectorBootstrap.ts` loads registration dynamically because the legacy command registry imports the studio catalogue. `vectorCommandsReady` resolves once both registries have the entries. Registration is idempotent and returns a disposer.

- `vector.inspect` returns a detached session snapshot; `vector.toSvg` serializes the open document. Both are read-only and callable by agent/MCP origins.
- Every other spec is `ui`: it changes state immediately and has no proposal queue. Agent/MCP origins are refused before validation or execution. Edits require an open Vector Studio document; blank/open operations require the active Vector Studio.
- Every run documents its history effect. Document writes call existing session functions and use the vector past/future stacks. Tool, view, selection and diagnostics do not enter document history. New/open retains the discard confirmation. Replacement/import remains one undo step, except opening a new session, which resets history.
- Schemas reject unknown fields and malformed nested data. Structured input arrays are capped at 200 entries to match the dispatcher's bounded validator. Larger SVG documents still open through source import; existing direct UI paths are not changed. Document/path/node/style schemas follow the vectorio model.
- Internal `commit`, `markVectorSaved`, subscriptions, hooks and test reset are not public commands. Arbitrary session patches and bypassing discard confirmation are not exposed. Saving/export completion belongs to the file adapter, not to a command that can falsely mark unsaved work saved.
- Titles are in the five studio-owned vector catalogues. No default shortcut is added. The runtime inventory awaits `vectorCommandsReady` and includes these specs.

Tests cover registry bridging, origin policy, strict schemas, history, import failure, discard cancellation, enablement, detached inputs and inspection, and the existing vector acceptance corpus.

Shell v2 adds 12 UI-only specs from `shellCommands.ts` (8 rail tools, rotation, reflection, SVG and PNG export), for 40 total registered specs. The original 28-spec session API stays unchanged. See `docs/studios/vector-shell.md`.
