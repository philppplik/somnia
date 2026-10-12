# Agent tool registry

Status: implemented (wave step 1). No MCP, ACP or new dependencies.

## Model
`AgentToolRegistry` (src/lib/agent/toolRegistry.ts) holds tool specs: a definition (name, description, JSON schema), a **level** and a `run` function.

| Level | Meaning | Enabled |
| --- | --- | --- |
| read | Returns data, changes nothing | default |
| propose | Stages a change that needs user review (diff, accept, apply, undo) | default |
| execute | Side effects | refused at registration unless the host allows it; nothing uses it |

- Grants can switch off levels or single tools. A disabled tool is not sent to the model and cannot be called.
- `toolSchemaHash` gives a stable hash of name, description and schema. Grants for future external tools (MCP) must bind to this hash so a changed schema does not inherit consent.
- `AgentProjectTools.definitions()` returns the three file tools plus enabled registry tools; the session sends exactly that list.
- Registry tools see only files the user authorized (`readableFiles`) and propose through the same reviewed write path as `write_file`. They cannot write to editor or disk.

## Native editor tools (src/lib/agent/editorTools.ts)
- `get_selection` (read): current selection, only if its file is authorized. Capped at 20,000 characters.
- `get_diagnostics` (read): current diagnostics for authorized files, max 200.
- `apply_css_op` (propose): `set_variable`, `add_variable`, `rename_class` using the editor's own cssTools, staged as normal proposals.

The app supplies selection/diagnostics with `setAgentEditorAccess` (panelBridge). Until the editor registers it, both read tools return empty results. That hook is not wired to CodeMirror yet.

## Limits
- Vector, PDF and image operations are not registered yet; they need the Flat->Scene adapter and per-format proposal types. Next steps.
- Tool results go to the model like file contents; the cloud consent guard covers them as before.
- Tests: src/lib/agent/editorTools.test.ts.

## Command bridge (src/lib/agent/commandTools.ts)
Tools for `read` and `propose` CommandSpecs are generated from the command dispatcher instead of being maintained by hand.

- Only `read` and `propose` specs are bridged. `ui` specs are never exposed, and the bridge cannot create `execute` tools. The level is checked again at call time against the live spec, and the dispatcher refuses `ui` specs from `agent` and `mcp` origins as a second barrier.
- Name: `cmd_` plus the spec id in snake case (`design.getState` becomes `cmd_design_get_state`). Hand-written tools (`get_selection`, `get_diagnostics`, `apply_css_op`, `code_read_range`, `studio_inspect`, studio registries) keep their names and implementations. An id that cannot form a valid name, or a name that is taken, is skipped and reported, never renamed.
- Calls run through `commandDispatcher.runCommand` with origin `agent` (agent panel) or `mcp` (MCP server): params are validated by the spec schema and each call is logged in the dispatcher activity.
- Wiring: `createTools` in panelBridge registers the current specs when a session or MCP source is built. Both rebuild per turn or per document, so specs that register late (Slides, Sheets, Design, Raster on canvas mount; Vector after `vectorCommandsReady`) appear on the next build. Long-lived registries can use `bindCommandTools`, which follows later registration and removal.
- Sound registers host-bound factories with its own dispatcher (documented exception). It is not bridged automatically; bind its dispatcher with `bindCommandTools(registry, soundDispatcher)` when needed.

### Consent hashes
Grants bind to `toolSchemaHash(name, description, parameters)`.

- No existing hash changes: existing tools are untouched, and generated names are new, so stored grants stay valid.
- A generated tool's description is built only from the spec id, title and level. Its hash changes exactly when the id, title, level or params schema of the spec changes. A changed hash invalidates a grant for that tool and the user approves again (fail closed). Changing a spec title therefore changes the hash: treat titles of bridged specs as part of the tool contract.
- The test `commandTools.test.ts` pins one hash so an accidental change of the description format fails CI.
