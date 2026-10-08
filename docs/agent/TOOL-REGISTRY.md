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
